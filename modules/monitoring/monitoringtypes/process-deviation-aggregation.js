const { Job } = require('./job');
const { AggregatedBpmnModel } = require('./bpmn/aggregated-bpmn-model');
const { SkipDeviation, OverlapDeviation, IncorrectExecutionSequenceDeviation,
    IncompleteDeviation, MultiExecutionDeviation, IncorrectBranchDeviation } = require('./bpmn/process-perspective');
const DDB = require('../../egsm-common/database/databaseconnector');

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
        this.initialize();
    }

    async initialize() {
        try {
            for (const [perspective, perspectiveData] of this.perspectives.entries()) {
                const perspectiveDeviations = await DDB.readAllProcessTypeDeviations(this.processType, perspective);
                const allInstances = await DDB.readAllProcessInstances(this.processType);
                this.deviationData.set(perspective, perspectiveDeviations);
                this._buildAggregatedStructures(perspective, perspectiveDeviations, allInstances, perspectiveData);
            }

            return true;
        } catch (error) {
            console.error(`Failed to initialize ProcessDeviationAggregation job: ${error.message}`);
            return false;
        }
    }

    _buildAggregatedStructures(perspectiveName, instanceDeviations, allInstances, perspectiveData) {
        const stageMap = new Map();
        const instanceLookup = new Map();
        let totalDeviations = 0;

        const allStages = perspectiveData.egsm_stages;

        // Initialize all stages
        allStages.forEach(stageName => {
            stageMap.set(stageName, {
                totalInstances: allInstances.length,
                instancesWithDeviations: new Set(),
                deviations: [],
                counts: new Map(), // deviation_type => count
                deviationRate: 0 // percentage of instances with deviations in this stage
            });
            instanceLookup.set(stageName, new Map());
        });

        for (const [instanceId, instanceData] of Object.entries(instanceDeviations)) {
            const deviations = instanceData.deviations || [];
            totalDeviations += deviations.length;

            const deviationsByStage = this._groupDeviationsByStage(deviations);

            for (const [stageName, stageDeviations] of deviationsByStage.entries()) {
                if (stageMap.has(stageName)) {
                    const stageData = stageMap.get(stageName);
                    stageData.instancesWithDeviations.add(instanceId);

                    // Add deviations
                    stageData.deviations.push(...stageDeviations.map(dev => ({
                        ...dev,
                        instanceId
                    })));

                    // Update counts
                    stageDeviations.forEach(deviation => {
                        const type = deviation.type;
                        stageData.counts.set(type, (stageData.counts.get(type) || 0) + 1);
                    });

                    // Store in instance lookup
                    instanceLookup.get(stageName).set(instanceId, stageDeviations);
                }
            }
        }

        // Calculate deviation rates for each stage
        for (const [_, stageData] of stageMap.entries()) {
            stageData.deviationRate = stageData.totalInstances > 0
                ? (stageData.instancesWithDeviations.size / stageData.totalInstances) * 100
                : 0;
        }

        // Store aggregated data
        this.stageAggregatedData.set(perspectiveName, stageMap);
        this.stageInstanceLookup.set(perspectiveName, instanceLookup);

        // Store summary
        this.perspectiveSummary.set(perspectiveName, {
            totalInstances: allInstances.length,
            instancesWithDeviations: Object.keys(instanceDeviations).length,
            instancesWithoutDeviations: allInstances.length - Object.keys(instanceDeviations).length,
            totalDeviations,
            stageCount: allStages.length,
            overallDeviationRate: allInstances.length > 0
                ? (Object.keys(instanceDeviations).length / allInstances.length) * 100
                : 0,
            lastUpdated: Date.now()
        });

        const bpmnModel = this.bpmnModels.get(perspectiveName);
        if (bpmnModel) {
            bpmnModel.applyAggregatedStatistics(stageMap);
        }
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
       * Called automatically when a process event received from the monitored process 
       * @param {Object} messageObj received process event object 
       */
    async handleDeviations(messageObj) {
        try {
            DDB.storeProcessDeviations(this.processType, messageObj.process_id, messageObj.process_perspective, messageObj.deviations)
            await this._updateInMemoryStructures(messageObj.process_perspective, messageObj.process_id, messageObj.deviations);
            console.log(`Updated aggregation for ${messageObj.process_perspective} - instance ${messageObj.process_id}`);
        } catch (error) {
            console.error(`Failed to handle deviations: ${error.message}`);
        }
    }

    /**
     * Handle external requests for aggregation data (similar to BpmnJob)
     * @param {Object} request Request object
     * @returns {Object} Response with requested data
     */
    handleExternalRequest(request) {
        switch (request.type) {
            case 'GET_COMPLETE_DATA':
                return this.getCompleteAggregationData();
            case 'GET_STAGE_DETAILS':
                return this.getStageDetails(request.perspectiveName, request.stageId);
            case 'GET_SUMMARY':
                return this.getAggregatedSummary();
            default:
                return { error: 'Unknown request type' };
        }
    }

    /**
     * Get aggregated summary across all perspectives
     * @returns {Object} Summary data
     */
    getAggregatedSummary() {
        const perspectiveSummaries = [];

        for (const [perspectiveName, model] of this.bpmnModels.entries()) {
            const perspectiveSummary = this.perspectiveSummary.get(perspectiveName);
            const bpmnSummary = model.getAggregatedSummary();

            perspectiveSummaries.push({
                ...perspectiveSummary,
                ...bpmnSummary
            });
        }

        return {
            perspectives: perspectiveSummaries,
            overall: this._calculateOverallSummary(perspectiveSummaries)
        };
    }

    /**
     * Trigger complete update event for WebSocket clients (like BpmnJob)
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
            perspectiveData[instanceId] = {
                instanceId: instanceId,
                processType: this.processType,
                perspective: perspectiveName,
                deviations: newDeviations,
                timestamp: Math.floor(Date.now() / 1000)
            };

            const allInstances = await DDB.readAllProcessInstances(this.processType);
            const perspectiveInfo = this.perspectives.get(perspectiveName);
            this._buildAggregatedStructures(perspectiveName, perspectiveData, allInstances, perspectiveInfo);
            console.log(`Updated in-memory structures for perspective: ${perspectiveName}`);

            // Trigger update for WebSocket clients after data update
            this.triggerCompleteUpdateEvent();

        } catch (error) {
            console.error(`Failed to update in-memory structures: ${error.message}`);
        }
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
            // Get BPMN diagram
            perspectives.push({
                name: perspectiveName,
                bpmn_xml: model.model_xml
            });

            // Get overlays
            const stageData = this.stageAggregatedData.get(perspectiveName);
            if (stageData) {
                model.applyAggregatedStatistics(stageData);
                overlays.push(...model.getAggregatedOverlay());
            }

            // Get perspective summary
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
                overall: this._calculateOverallSummary(perspectiveSummaries)
            },
            type: 'COMPLETE_AGGREGATION',
            timestamp: Date.now()
        };
    }

    /**
     * Calculate overall summary across all perspectives
     * @param {Array} perspectiveSummaries Individual perspective summaries
     * @returns {Object} Overall summary
     */
    _calculateOverallSummary(perspectiveSummaries) {
        if (perspectiveSummaries.length === 0) return {};

        const overall = {
            totalPerspectives: perspectiveSummaries.length,
            averageDeviationRate: 0,
            totalInstances: 0,
            totalDeviations: 0,
            severityDistribution: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 }
        };

        perspectiveSummaries.forEach(summary => {
            overall.averageDeviationRate += summary.overallDeviationRate || 0;
            overall.totalInstances = Math.max(overall.totalInstances, summary.totalInstances || 0);
            overall.totalDeviations += summary.totalDeviations || 0;

            if (summary.severityDistribution) {
                Object.keys(overall.severityDistribution).forEach(severity => {
                    overall.severityDistribution[severity] += summary.severityDistribution[severity] || 0;
                });
            }
        });

        overall.averageDeviationRate = overall.averageDeviationRate / perspectiveSummaries.length;

        return overall;
    }

    /**
     * Get detailed breakdown for a specific stage
     * @param {string} perspectiveName Perspective name
     * @param {string} stageId Stage ID
     * @returns {Object} Detailed stage information
     */
    getStageDetails(perspectiveName, stageId) {
        const stageData = this.stageAggregatedData.get(perspectiveName)?.get(stageId);
        const instanceLookup = this.stageInstanceLookup.get(perspectiveName)?.get(stageId);

        if (!stageData) {
            return null;
        }

        return {
            stageId,
            perspectiveName,
            totalInstances: stageData.totalInstances,
            instancesWithDeviations: stageData.instancesWithDeviations.size,
            deviationRate: stageData.deviationRate,
            deviationCounts: Object.fromEntries(stageData.counts),
            affectedInstances: Array.from(stageData.instancesWithDeviations),
            recentDeviations: stageData.deviations
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                .slice(0, 10) // Last 10 deviations
        };
    }

    _getRelevantBlockIds(deviation) {
        if (deviation.type === 'SKIPPED') {
            // Skip may have multiple stages, return all skipped stages as separate entries
            return Array.isArray(deviation.block_a) ? deviation.block_a : [deviation.block_a];
        }

        return deviation.block_a;
    }
}

module.exports = { ProcessDeviationAggregation };