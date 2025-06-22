const { Job } = require('./job');
const { AggregatedBpmnModel } = require('./bpmn/aggregated-bpmn-model');
const { SkipDeviation, OverlapDeviation, IncorrectExecutionSequenceDeviation,
    IncompleteDeviation, MultiExecutionDeviation, IncorrectBranchDeviation } = require('./bpmn/process-perspective');
const DDB = require('../../egsm-common/database/databaseconnector');
const performanceTracker = require('../../egsm-common/monitoring/performanceTracker');

/**
 * ProcessDeviationAggregation job combines data from multiple instances 
 * of the same process type to show aggregated deviation information
 */
class ProcessDeviationAggregation extends Job {
    /**
     * @param {string} id Job ID
     * @param {string[]} brokers MQTT broker addresses
     * @param {string} owner Owner of the job
     * @param {string} processType Process type to aggregate
     * @param {string} perspective Process perspective
     * @param {Object[]} notificationrules Notification rules
     * @param {Object} notificationmanager Notification manager
     */
    constructor(id, brokers, owner, processType, perspectives, notificationrules, notificationmanager) {
        super(id, 'process-deviation-aggregation', brokers, owner, [], [], [], notificationrules, notificationmanager);
        this.processType = processType;
        this.perspectives = new Map();
        this.bpmnModels = new Map(); // perspective => AggregatedBpmnModel

        for (const [_, perspectiveData] of perspectives.entries()) {
            this.perspectives.set(perspectiveData.name, perspectiveData);
            this.bpmnModels.set(perspectiveData.name,
                new AggregatedBpmnModel(perspectiveData.name, perspectiveData.bpmn_diagram));
        }

        this.deviationData = new Map(); // perspective => instance => deviations[]
        this.stageAggregatedData = new Map(); // perspective => stage => { instances: Set, deviations: [], counts: Map }
        this.stageInstanceLookup = new Map(); // perspective => stage => instance => deviations[]
        this.perspectiveSummary = new Map(); // perspective => { totalInstances: number, totalDeviations: number, etc. }
        this.stageCorrelations = new Map(); // perspective => Map<stage1-stage2, count>
        this.instanceDeviationCounts = new Map(); // perspective => Map<instanceId, count>
        this.deviationTypeCounts = new Map(); // perspective => Map<type, count>
        this.deviationTypeInstances = new Map(); // perspective => Map<type, Set<instanceId>>
        this.deviationTypePercentages = new Map(); // perspective => Map<type, percentage>

        this.isInitialized = false;
    }

    async initialize() {
        try {
            for (const [perspective, perspectiveData] of this.perspectives.entries()) {
                const perspectiveDeviations = await DDB.readAllProcessTypeDeviations(this.processType, perspective);
                const allInstances = await DDB.readAllProcessInstances(this.processType);
                const completeInstanceData = {};

                allInstances.forEach(instance => {
                    const engineId = instance.instance_id;
                    const instanceId = this._extractInstanceId(engineId, perspective);

                    // Only include instances for this perspective
                    if (engineId.endsWith(`__${perspective}`)) {
                        completeInstanceData[instanceId] = {
                            instanceId: instanceId,
                            processType: this.processType,
                            perspective: perspective,
                            deviations: [],
                            timestamp: Math.floor(Date.now() / 1000)
                        };
                    }
                });

                // Override with actual deviation data where it exists
                Object.entries(perspectiveDeviations).forEach(([instanceId, deviationData]) => {
                    if (completeInstanceData[instanceId]) {
                        completeInstanceData[instanceId].deviations = deviationData.deviations || [];
                    } else {
                        console.warn(`Instance ${instanceId} has deviations but not found in allInstances`);
                    }
                });

                this.deviationData.set(perspective, completeInstanceData);
                const perspectiveInstances = allInstances.filter(instance =>
                    instance.instance_id.endsWith(`__${perspective}`)
                );

                this._buildAggregatedStructures(perspective, completeInstanceData, perspectiveInstances, perspectiveData);
            }
            return true;
        } catch (error) {
            console.error(`Failed to initialize ProcessDeviationAggregation job: ${error.message}`);
            return false;
        }
    }

    /**
    * Called automatically when deviations received
    * @param {Object} messageObj received process event object 
    */
    async handleDeviations(messageObj) {
        try {
            await this._updateInMemoryStructures(messageObj.process_perspective, messageObj.process_id, messageObj.deviations);
        } catch (error) {
            console.error(`Failed to handle deviations: ${error.message}`);
        }
    }

    /**
    * Handle new process instance notification
    * @param {string} instanceId New instance ID
    */
    async handleNewInstance(instanceId) {
        if (!this.isInitialized) {
            await this.initialize();
            this.isInitialized = true;
        }

        try {
            for (const [perspectiveName, _] of this.perspectives.entries()) {
                if (!this.deviationData.has(perspectiveName)) {
                    this.deviationData.set(perspectiveName, {});
                }

                // Add instance with empty deviations initially
                this.deviationData.get(perspectiveName)[instanceId] = {
                    instanceId: instanceId,
                    processType: this.processType,
                    perspective: perspectiveName,
                    deviations: [],
                    timestamp: Math.floor(Date.now() / 1000)
                };
            }

            const samplePerspective = this.perspectives.keys().next().value;
            const existingInstances = Object.keys(this.deviationData.get(samplePerspective) || {});
            const totalInstanceCount = existingInstances.length;

            for (const [perspectiveName, perspectiveInfo] of this.perspectives.entries()) {
                const perspectiveData = this.deviationData.get(perspectiveName) || {};
                this._buildAggregatedStructuresWithCount(perspectiveName, perspectiveData, totalInstanceCount, perspectiveInfo);
            }

            this.triggerCompleteUpdateEvent();
        } catch (error) {
            console.error(`Failed to handle new instance: ${error.message}`);
        }
    }

    _buildAggregatedStructures(perspectiveName, instanceDeviations, allInstances, perspectiveData) {
        const stageMap = new Map();
        const instanceLookup = new Map();
        let totalDeviations = 0;
        let actualInstancesWithDeviations = 0;

        // Filter out SequenceFlow stages from the stage list
        const allStages = perspectiveData.egsm_stages.filter(stageName =>
            !stageName.startsWith('SequenceFlow')
        );

        allStages.forEach(stageName => {
            stageMap.set(stageName, {
                totalInstances: allInstances.length,
                instancesWithDeviations: new Set(),
                deviations: [],
                counts: new Map(),
                deviationRate: 0
            });
            instanceLookup.set(stageName, new Map());
        });

        this._initializeProcessAggregations(perspectiveName);

        for (const [instanceId, instanceData] of Object.entries(instanceDeviations)) {
            const deviations = instanceData.deviations || [];

            if (deviations.length > 0) {
                actualInstancesWithDeviations++;
            }

            totalDeviations += deviations.length;

            this._updateProcessAggregations(perspectiveName, instanceId, deviations, allInstances.length);

            const deviationsByStage = this._groupDeviationsByStage(deviations);

            for (const [stageName, stageDeviations] of deviationsByStage.entries()) {
                // Skip SequenceFlow stages and only process stages that are in our filtered list
                if (stageName && !stageName.startsWith('SequenceFlow') && stageMap.has(stageName)) {
                    const stageData = stageMap.get(stageName);
                    stageData.instancesWithDeviations.add(instanceId);

                    stageData.deviations.push(...stageDeviations.map(dev => ({
                        ...dev,
                        instanceId
                    })));

                    stageDeviations.forEach(deviation => {
                        const type = deviation.type;
                        stageData.counts.set(type, (stageData.counts.get(type) || 0) + 1);
                    });

                    instanceLookup.get(stageName).set(instanceId, stageDeviations);
                }
            }
        }

        for (const [_, stageData] of stageMap.entries()) {
            stageData.deviationRate = stageData.totalInstances > 0
                ? (stageData.instancesWithDeviations.size / stageData.totalInstances) * 100
                : 0;
        }

        this.stageAggregatedData.set(perspectiveName, stageMap);
        this.stageInstanceLookup.set(perspectiveName, instanceLookup);

        this.perspectiveSummary.set(perspectiveName, {
            totalInstances: allInstances.length,
            instancesWithDeviations: actualInstancesWithDeviations,
            instancesWithoutDeviations: allInstances.length - actualInstancesWithDeviations,
            totalDeviations,
            stageCount: allStages.length,
            overallDeviationRate: allInstances.length > 0
                ? (actualInstancesWithDeviations / allInstances.length) * 100
                : 0,
            lastUpdated: Date.now()
        });

        const bpmnModel = this.bpmnModels.get(perspectiveName);
        if (bpmnModel) {
            bpmnModel.applyAggregatedStatistics(stageMap);
        }
    }

    /**
     * Initialize process-level aggregation structures for a perspective
     * @param {string} perspectiveName Name of the perspective
     */
    _initializeProcessAggregations(perspectiveName) {
        this.stageCorrelations.set(perspectiveName, new Map());
        this.instanceDeviationCounts.set(perspectiveName, new Map());
        this.deviationTypeCounts.set(perspectiveName, new Map());
        this.deviationTypeInstances.set(perspectiveName, new Map());
        this.deviationTypePercentages.set(perspectiveName, new Map());
    }

    /**
     * Update process-level aggregations for an instance
     * @param {string} perspectiveName Name of the perspective
     * @param {string} instanceId Instance ID
     * @param {Array} deviations Array of deviations for this instance
     * @param {number} totalInstances Total number of instances for percentage calculations
     */
    _updateProcessAggregations(perspectiveName, instanceId, deviations, totalInstances) {
        const correlations = this.stageCorrelations.get(perspectiveName);
        const instanceCounts = this.instanceDeviationCounts.get(perspectiveName);
        const typeCounts = this.deviationTypeCounts.get(perspectiveName);
        const typeInstances = this.deviationTypeInstances.get(perspectiveName);
        const typePercentages = this.deviationTypePercentages.get(perspectiveName);

        // Filter out SequenceFlow deviations before counting
        const filteredDeviations = deviations.filter(deviation => {
            const stageNames = this._getRelevantBlockIds(deviation);
            const stages = Array.isArray(stageNames) ? stageNames : [stageNames];

            // Only include deviation if it involves at least one non-SequenceFlow stage
            return stages.some(stage => stage && !stage.startsWith('SequenceFlow'));
        });

        instanceCounts.set(instanceId, filteredDeviations.length);

        if (filteredDeviations.length === 0) return;

        const stagesWithDeviations = new Set();
        const deviationTypes = new Set();

        filteredDeviations.forEach(deviation => {
            const stageNames = this._getRelevantBlockIds(deviation);
            const stages = Array.isArray(stageNames) ? stageNames : [stageNames];

            stages.forEach(stage => {
                // Filter out SequenceFlow stages from correlations
                if (stage && !stage.startsWith('SequenceFlow')) {
                    stagesWithDeviations.add(stage);
                }
            });

            const type = deviation.type;
            deviationTypes.add(type);
            typeCounts.set(type, (typeCounts.get(type) || 0) + 1);

            if (!typeInstances.has(type)) {
                typeInstances.set(type, new Set());
            }
            typeInstances.get(type).add(instanceId);
        });

        // Update stage correlations (pairs of stages that both have deviations in same instance)
        const stageArray = Array.from(stagesWithDeviations)
            .filter(stage => !stage.startsWith('SequenceFlow'))
            .sort();

        for (let i = 0; i < stageArray.length; i++) {
            for (let j = i + 1; j < stageArray.length; j++) {
                const pair = `${stageArray[i]}-${stageArray[j]}`;
                correlations.set(pair, (correlations.get(pair) || 0) + 1);
            }
        }

        deviationTypes.forEach(type => {
            const instancesWithType = typeInstances.get(type).size;
            const percentage = totalInstances > 0 ? (instancesWithType / totalInstances) * 100 : 0;
            typePercentages.set(type, percentage);
        });
    }

    _groupDeviationsByStage(deviations) {
        const stageGroups = new Map();
        deviations.forEach(deviation => {
            const stageNames = this._getRelevantBlockIds(deviation);

            if (Array.isArray(stageNames)) {
                stageNames.forEach(stageName => {
                    if (!stageGroups.has(stageName)) {
                        stageGroups.set(stageName, []);
                    }
                    stageGroups.get(stageName).push({
                        ...deviation,
                        relevantStage: stageName
                    });
                });
            } else if (stageNames) {
                if (!stageGroups.has(stageNames)) {
                    stageGroups.set(stageNames, []);
                }
                stageGroups.get(stageNames).push(deviation);
            }
        });

        return stageGroups;
    }

    /**
     * Build aggregated structures with known instance count (optimization for new instances)
     * @param {string} perspectiveName Name of the perspective
     * @param {Object} instanceDeviations Deviation data for instances
     * @param {number} totalInstanceCount Total number of instances
     * @param {Object} perspectiveData Perspective configuration
     */
    _buildAggregatedStructuresWithCount(perspectiveName, instanceDeviations, totalInstanceCount, perspectiveData) {
        const stageMap = new Map();
        const instanceLookup = new Map();
        let totalDeviations = 0;
        let actualInstancesWithDeviations = 0;

        // Filter out SequenceFlow stages from the stage list
        const allStages = perspectiveData.egsm_stages.filter(stageName =>
            !stageName.startsWith('SequenceFlow')
        );

        allStages.forEach(stageName => {
            stageMap.set(stageName, {
                totalInstances: totalInstanceCount,
                instancesWithDeviations: new Set(),
                deviations: [],
                counts: new Map(),
                deviationRate: 0
            });
            instanceLookup.set(stageName, new Map());
        });

        this._initializeProcessAggregations(perspectiveName);

        for (const [instanceId, instanceData] of Object.entries(instanceDeviations)) {
            const deviations = instanceData.deviations || [];

            if (deviations.length > 0) {
                actualInstancesWithDeviations++;
            }

            totalDeviations += deviations.length;

            this._updateProcessAggregations(perspectiveName, instanceId, deviations, totalInstanceCount);

            const deviationsByStage = this._groupDeviationsByStage(deviations);

            for (const [stageName, stageDeviations] of deviationsByStage.entries()) {
                if (stageName && !stageName.startsWith('SequenceFlow') && stageMap.has(stageName)) {
                    const stageData = stageMap.get(stageName);
                    stageData.instancesWithDeviations.add(instanceId);

                    stageData.deviations.push(...stageDeviations.map(dev => ({
                        ...dev,
                        instanceId
                    })));

                    stageDeviations.forEach(deviation => {
                        const type = deviation.type;
                        stageData.counts.set(type, (stageData.counts.get(type) || 0) + 1);
                    });

                    instanceLookup.get(stageName).set(instanceId, stageDeviations);
                }
            }
        }

        for (const [_, stageData] of stageMap.entries()) {
            stageData.deviationRate = stageData.totalInstances > 0
                ? (stageData.instancesWithDeviations.size / stageData.totalInstances) * 100
                : 0;
        }

        this.stageAggregatedData.set(perspectiveName, stageMap);
        this.stageInstanceLookup.set(perspectiveName, instanceLookup);

        this.perspectiveSummary.set(perspectiveName, {
            totalInstances: totalInstanceCount,
            instancesWithDeviations: actualInstancesWithDeviations,
            instancesWithoutDeviations: totalInstanceCount - actualInstancesWithDeviations,
            totalDeviations,
            stageCount: allStages.length,
            overallDeviationRate: totalInstanceCount > 0
                ? (actualInstancesWithDeviations / totalInstanceCount) * 100
                : 0,
            lastUpdated: Date.now()
        });

        const bpmnModel = this.bpmnModels.get(perspectiveName);
        if (bpmnModel) {
            bpmnModel.applyAggregatedStatistics(stageMap);
        }
    }

    /**
     * Get process-level aggregations for a specific perspective
     * @param {string} perspectiveName Name of the perspective (optional)
     * @returns {Object} Process aggregation data
     */
    getProcessAggregations(perspectiveName = null) {
        const result = {};

        const perspectives = perspectiveName
            ? [perspectiveName]
            : Array.from(this.perspectives.keys());

        perspectives.forEach(perspective => {
            if (!this.stageCorrelations.has(perspective)) return;

            result[perspective] = {
                stageCorrelations: this._getTopStageCorrelations(perspective, 10),
                instanceDeviationCounts: Object.fromEntries(this.instanceDeviationCounts.get(perspective)),
                deviationTypeCounts: Object.fromEntries(this.deviationTypeCounts.get(perspective)),
                deviationTypeInstances: this._convertSetMapToObject(this.deviationTypeInstances.get(perspective)),
                deviationTypePercentages: Object.fromEntries(this.deviationTypePercentages.get(perspective))
            };
        });

        return result;
    }

    /**
     * Get top stage correlations sorted by frequency
     * @param {string} perspectiveName Name of the perspective
     * @param {number} limit Maximum number of correlations to return
     * @returns {Array} Array of correlation objects
     */
    _getTopStageCorrelations(perspectiveName, limit = 10) {
        const correlations = this.stageCorrelations.get(perspectiveName);
        if (!correlations) return [];

        return Array.from(correlations.entries())
            .map(([pair, count]) => {
                const [stage1, stage2] = pair.split('-');
                return { stage1, stage2, count };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * Convert Map with Set values to plain object
     * @param {Map} map Map with Set values
     * @returns {Object} Plain object with array values
     */
    _convertSetMapToObject(map) {
        const result = {};
        if (!map) return result;

        for (const [key, set] of map.entries()) {
            result[key] = Array.from(set);
        }
        return result;
    }

    /**
     * Get aggregated summary across all perspectives
     * @returns {Object} Summary data
     */
    getAggregatedSummary() {
        const perspectiveSummaries = [];

        for (const [perspectiveName, stageData] of this.stageAggregatedData.entries()) {
            let totalStages = 0;
            let stagesWithDeviations = 0;
            let totalDeviationRate = 0;
            const stageDetails = {};

            for (const [stageId, stats] of stageData.entries()) {
                // Skip SequenceFlow stages in summary calculations
                if (stageId.startsWith('SequenceFlow')) {
                    continue;
                }

                totalStages++;
                if (stats.deviationRate > 0) {
                    stagesWithDeviations++;
                    totalDeviationRate += stats.deviationRate;
                }

                // Add stage details for frontend tooltip use
                stageDetails[stageId] = {
                    totalInstances: stats.totalInstances,
                    instancesWithDeviations: stats.instancesWithDeviations instanceof Set ?
                        stats.instancesWithDeviations.size : stats.instancesWithDeviations,
                    deviationRate: stats.deviationRate,
                    deviationCounts: Object.fromEntries(stats.counts)
                };
            }

            const perspectiveSummary = this.perspectiveSummary.get(perspectiveName) || {};

            perspectiveSummaries.push({
                perspective: perspectiveName,
                totalStages,
                stagesWithDeviations,
                stagesWithoutDeviations: totalStages - stagesWithDeviations,
                averageDeviationRate: stagesWithDeviations > 0 ? (totalDeviationRate / stagesWithDeviations) : 0,
                stageDetails,
                ...perspectiveSummary
            });
        }

        return {
            perspectives: perspectiveSummaries,
            overall: this._calculateOverallSummary(perspectiveSummaries),
            processAggregations: this.getProcessAggregations()
        };
    }

    /**
     * Trigger complete update event for WebSocket clients
     */
    triggerCompleteUpdateEvent() {
        const updateData = this.getCompleteAggregationData();
        this.eventEmitter.emit('job-update', updateData);
    }

    async _updateInMemoryStructures(perspectiveName, instanceId, newDeviations) {
        try {
            if (!this.perspectives.has(perspectiveName)) {
                console.warn(`Received deviations for unknown perspective: ${perspectiveName}`);
                return;
            }

            if (!this.deviationData.has(perspectiveName)) {
                this.deviationData.set(perspectiveName, {});
            }

            const perspectiveData = this.deviationData.get(perspectiveName);
            const existingData = perspectiveData[instanceId];

            if (existingData && this._deviationsEqual(existingData.deviations, newDeviations)) {
                return;
            }

            perspectiveData[instanceId] = {
                instanceId: instanceId,
                processType: this.processType,
                perspective: perspectiveName,
                deviations: newDeviations,
                timestamp: Math.floor(Date.now() / 1000)
            };

            const totalInstanceCount = Object.keys(perspectiveData).length;
            const perspectiveInfo = this.perspectives.get(perspectiveName);
            this._buildAggregatedStructuresWithCount(perspectiveName, perspectiveData, totalInstanceCount, perspectiveInfo);
            this.triggerCompleteUpdateEvent();

        } catch (error) {
            console.error(`Failed to update in-memory structures: ${error.message}`);
        }
    }

    /**
     * Compare two deviation arrays to check if they're equal
     * @param {Array} deviations1 First deviation array
     * @param {Array} deviations2 Second deviation array
     * @returns {boolean} True if arrays are equal
     */
    _deviationsEqual(deviations1, deviations2) {
        if (!deviations1 && !deviations2) return true;
        if (!deviations1 || !deviations2) return false;
        if (deviations1.length !== deviations2.length) return false;

        // Sort both arrays by a consistent property
        const sorted1 = [...deviations1].sort((a, b) => `${a.type}_${a.block_a}`.localeCompare(`${b.type}_${b.block_a}`));
        const sorted2 = [...deviations2].sort((a, b) => `${a.type}_${a.block_a}`.localeCompare(`${b.type}_${b.block_a}`));

        return sorted1.every((dev1, index) => {
            const dev2 = sorted2[index];
            return dev1.type === dev2.type &&
                dev1.block_a === dev2.block_a &&
                dev1.block_b === dev2.block_b &&
                JSON.stringify(dev1.details) === JSON.stringify(dev2.details);
        });
    }

    /**
     * Get complete aggregation data including diagrams, overlays, and summary
     * @returns {Object} Complete aggregation data
     */
    getCompleteAggregationData() {
        const overlays = [];
        const perspectives = [];
        const perspectiveSummaries = [];

        for (const [perspectiveName, model] of this.bpmnModels.entries()) {
            perspectives.push({
                name: perspectiveName,
                bpmn_xml: model.model_xml
            });

            const stageData = this.stageAggregatedData.get(perspectiveName);
            if (stageData) {
                model.applyAggregatedStatistics(stageData);
                overlays.push(...model.getAggregatedOverlay());
            }

            const perspectiveSummary = this.perspectiveSummary.get(perspectiveName);
            const bpmnSummary = model.getAggregatedSummary();

            perspectiveSummaries.push({
                ...perspectiveSummary,
                ...bpmnSummary
            });
        }

        return {
            job_id: this.id,
            job_type: 'process-deviation-aggregation',
            process_type: this.processType,
            perspectives: perspectives,
            overlays: overlays,
            summary: {
                perspectives: perspectiveSummaries,
                overall: this._calculateOverallSummary(perspectiveSummaries),
                processAggregations: this.getProcessAggregations()
            },
            type: 'COMPLETE_AGGREGATION',
            timestamp: Date.now()
        };
    }

    /**
     * Calculate overall summary across all perspectives
     */
    _calculateOverallSummary(perspectiveSummaries) {
        if (perspectiveSummaries.length === 0) return {};

        // Use the first perspective to get instance counts (should be same across perspectives)
        const firstPerspective = perspectiveSummaries[0];

        const overall = {
            totalPerspectives: perspectiveSummaries.length,
            totalInstances: firstPerspective.totalInstances || 0,
            totalDeviations: 0,
            instancesWithDeviations: 0,
            instancesWithoutDeviations: 0,
            averageDeviationRate: 0
        };

        let totalDeviationRate = 0;
        perspectiveSummaries.forEach(summary => {
            overall.totalDeviations += summary.totalDeviations || 0;
            totalDeviationRate += summary.overallDeviationRate || 0;

            overall.instancesWithDeviations = Math.max(overall.instancesWithDeviations, summary.instancesWithDeviations || 0);
        });

        overall.instancesWithoutDeviations = overall.totalInstances - overall.instancesWithDeviations;
        overall.averageDeviationRate = totalDeviationRate / perspectiveSummaries.length;
        return overall;
    }

    /**
     * Get relevant block IDs for a deviation, normalizing iteration stages
     * @param {Object} deviation Deviation object
     * @returns {string|string[]} Stage name(s) where deviation should be tracked
     */
    _getRelevantBlockIds(deviation) {
        let blockIds;

        if (deviation.type === 'SKIPPED') {
            // Skip may have multiple stages, return all skipped stages as separate entries
            blockIds = Array.isArray(deviation.block_a) ? deviation.block_a : [deviation.block_a];
        } else if (deviation.type === 'OVERLAP') {
            // For overlap deviations, the problem is with the 'open' stage (block_b)
            blockIds = [deviation.block_b];
        } else {
            blockIds = [deviation.block_a];
        }

        // Remove _iteration suffix to group loop and iteration deviations together
        if (Array.isArray(blockIds)) {
            return blockIds.map(blockId => this._normalizeStageId(blockId));
        } else {
            return this._normalizeStageId(blockIds);
        }
    }

    /**
     * Normalize stage ID by removing iteration suffix
     * @param {string} stageId Original stage ID
     * @returns {string} Normalized stage ID
     */
    _normalizeStageId(stageId) {
        if (!stageId) return stageId;
        if (stageId.endsWith('_iteration')) {
            return stageId.slice(0, -10);
        }

        return stageId;
    }

    /**
     * Extract actual instance ID from engine ID
     * @param {string} engineId Engine ID like "p3__Truck"
     * @param {string} perspective Perspective name like "Truck"
     * @returns {string} Instance ID like "p3"
     */
    _extractInstanceId(engineId, perspective) {
        const suffix = `__${perspective}`;
        if (engineId.endsWith(suffix)) {
            return engineId.slice(0, -suffix.length);
        }
        return engineId;
    }
}

module.exports = { ProcessDeviationAggregation };