var xml2js = require('xml2js');
const { BpmnModel } = require('./bpmn-model');
const { BpmnBlockOverlayReport } = require('./bpmn-constructs');

/**
 * BPMN Model specialized for aggregated deviation statistics
 * Extends the base BpmnModel but provides different overlay generation
 * focused on aggregated data rather than individual instance deviations
 */
class AggregatedBpmnModel extends BpmnModel {
    constructor(perspectiveName, modelXml) {
        super(perspectiveName, modelXml);
        this.aggregatedData = new Map(); // stageId => aggregated stats
    }

    /**
     * Apply aggregated statistics to the model
     * @param {Map} stageAggregatedData Map of stage => { totalInstances, instancesWithDeviations, deviations, counts, deviationRate }
     */
    applyAggregatedStatistics(stageAggregatedData) {
        this.aggregatedData.clear();
        
        for (const [stageId, stats] of stageAggregatedData.entries()) {
            if (this.constructs.has(stageId)) {
                this.aggregatedData.set(stageId, stats);
                const construct = this.constructs.get(stageId);
                this._applyStatisticsToConstruct(construct, stats);
            }
        }
    }

    /**
     * Apply aggregated statistics to a specific construct
     * @param {BpmnBlock} construct The BPMN construct to update
     * @param {Object} stats Aggregated statistics for this stage
     */
    _applyStatisticsToConstruct(construct, stats) {
        // Calculate severity based on deviation rate
        const severity = this._calculateSeverity(stats.deviationRate);
        
        // Set aggregated status based on predominant deviation types
        const predominantDeviation = this._getPredominantDeviation(stats.counts);
        
        // Store aggregated information on the construct
        construct.aggregatedStats = {
            deviationRate: stats.deviationRate,
            totalInstances: stats.totalInstances,
            instancesWithDeviations: stats.instancesWithDeviations.size,
            predominantDeviation,
            severity,
            deviationCounts: Object.fromEntries(stats.counts),
            deviationBreakdown: this._getDeviationBreakdown(stats.counts)
        };

        // Set construct status based on aggregated data
        construct.aggregatedStatus = this._getAggregatedStatus(stats);
    }

    /**
     * Calculate severity level based on deviation rate
     * @param {number} deviationRate Percentage of instances with deviations
     * @returns {string} Severity level
     */
    _calculateSeverity(deviationRate) {
        if (deviationRate >= 75) return 'CRITICAL';
        if (deviationRate >= 50) return 'HIGH';
        if (deviationRate >= 25) return 'MEDIUM';
        if (deviationRate > 0) return 'LOW';
        return 'NONE';
    }

    /**
     * Get the most common deviation type
     * @param {Map} countsMap Map of deviation type to count
     * @returns {string} Most common deviation type
     */
    _getPredominantDeviation(countsMap) {
        if (countsMap.size === 0) return 'NONE';
        
        let maxCount = 0;
        let predominant = 'NONE';
        
        for (const [type, count] of countsMap.entries()) {
            if (count > maxCount) {
                maxCount = count;
                predominant = type;
            }
        }
        
        return predominant;
    }

    /**
     * Get breakdown of deviation types with percentages
     * @param {Map} countsMap Map of deviation type to count
     * @returns {Array} Array of deviation breakdown objects
     */
    _getDeviationBreakdown(countsMap) {
        const totalDeviations = Array.from(countsMap.values()).reduce((sum, count) => sum + count, 0);
        if (totalDeviations === 0) return [];

        const breakdown = [];
        for (const [type, count] of countsMap.entries()) {
            breakdown.push({
                type,
                count,
                percentage: Math.round((count / totalDeviations) * 100)
            });
        }

        // Sort by count descending
        return breakdown.sort((a, b) => b.count - a.count);
    }

    /**
     * Get aggregated status for a construct
     * @param {Object} stats Aggregated statistics
     * @returns {string} Status string
     */
    _getAggregatedStatus(stats) {
        if (stats.deviationRate === 0) return 'NORMAL';
        if (stats.deviationRate >= 75) return 'CRITICAL_DEVIATIONS';
        if (stats.deviationRate >= 50) return 'HIGH_DEVIATIONS';
        if (stats.deviationRate >= 25) return 'MEDIUM_DEVIATIONS';
        return 'LOW_DEVIATIONS';
    }

    /**
     * Get overlay for aggregated view - this replaces the instance-specific overlay
     * @returns {Array} Array of BpmnBlockOverlayReport objects
     */
    getAggregatedOverlay() {
        const result = [];
        
        this.constructs.forEach(element => {
            if (element.constructor.name === 'BpmnTask' || 
                element.constructor.name === 'BpmnEvent' || 
                element.constructor.name === 'BpmnGateway') {
                
                const stageId = element.id;
                const stats = this.aggregatedData.get(stageId);
                
                if (stats && stats.deviationRate > 0) {
                    const color = this._getAggregatedColor(stats);
                    const flags = this._getAggregatedFlags(stats);
                    
                    result.push(new BpmnBlockOverlayReport(
                        this.perspective_name, 
                        element.id, 
                        color, 
                        flags
                    ));
                } else {
                    // No deviations for this stage - show as normal
                    result.push(new BpmnBlockOverlayReport(
                        this.perspective_name, 
                        element.id, 
                        'GREEN', 
                        []
                    ));
                }
            }
        });
        
        return result;
    }

    /**
     * Get color based on aggregated severity
     * @param {Object} stats Aggregated statistics
     * @returns {string} Color code
     */
    _getAggregatedColor(stats) {
        const severity = this._calculateSeverity(stats.deviationRate);
        switch (severity) {
            case 'CRITICAL': return 'DARK_RED';
            case 'HIGH': return 'RED';
            case 'MEDIUM': return 'ORANGE';
            case 'LOW': return 'YELLOW';
            default: return 'GREEN';
        }
    }

    /**
     * Get flags for aggregated display
     * @param {Object} stats Aggregated statistics
     * @returns {Array} Array of flag objects
     */
    _getAggregatedFlags(stats) {
        const flags = [];
        
        // Add deviation rate flag
        flags.push({
            type: 'DEVIATION_RATE',
            value: `${stats.deviationRate.toFixed(1)}%`,
            severity: this._calculateSeverity(stats.deviationRate),
            description: `${stats.instancesWithDeviations.size}/${stats.totalInstances} instances affected`
        });

        // Add predominant deviation type if exists
        const predominant = this._getPredominantDeviation(stats.counts);
        if (predominant !== 'NONE') {
            const predominantCount = stats.counts.get(predominant);
            flags.push({
                type: 'PREDOMINANT_DEVIATION',
                value: this._formatDeviationType(predominant),
                count: predominantCount,
                description: `Most common: ${predominantCount} occurrences`
            });
        }

        // Add breakdown of top deviation types (max 3)
        const breakdown = this._getDeviationBreakdown(stats.counts);
        if (breakdown.length > 1) {
            const topDeviations = breakdown.slice(0, 3);
            flags.push({
                type: 'DEVIATION_BREAKDOWN',
                value: topDeviations.map(d => `${this._formatDeviationType(d.type)}: ${d.percentage}%`).join(', '),
                description: 'Deviation type distribution'
            });
        }

        return flags;
    }

    /**
     * Format deviation type for display
     * @param {string} type Deviation type
     * @returns {string} Formatted type
     */
    _formatDeviationType(type) {
        const typeMap = {
            'SKIPPED': 'Skip',
            'OVERLAP': 'Overlap',
            'INCOMPLETE': 'Incomplete',
            'MULTI_EXECUTION': 'Multi-exec',
            'INCORRECT_EXECUTION': 'Wrong sequence',
            'INCORRECT_BRANCH': 'Wrong branch'
        };
        return typeMap[type] || type;
    }

    /**
     * Get summary statistics for the entire perspective
     * @returns {Object} Summary statistics
     */
    getAggregatedSummary() {
        let totalStages = 0;
        let stagesWithDeviations = 0;
        let totalDeviationRate = 0;
        let severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };

        for (const [stageId, stats] of this.aggregatedData.entries()) {
            totalStages++;
            if (stats.deviationRate > 0) {
                stagesWithDeviations++;
                totalDeviationRate += stats.deviationRate;
            }
            
            const severity = this._calculateSeverity(stats.deviationRate);
            severityCounts[severity]++;
        }

        return {
            perspective: this.perspective_name,
            totalStages,
            stagesWithDeviations,
            stagesWithoutDeviations: totalStages - stagesWithDeviations,
            averageDeviationRate: stagesWithDeviations > 0 ? (totalDeviationRate / stagesWithDeviations) : 0,
            severityDistribution: severityCounts
        };
    }
}

module.exports = { AggregatedBpmnModel };