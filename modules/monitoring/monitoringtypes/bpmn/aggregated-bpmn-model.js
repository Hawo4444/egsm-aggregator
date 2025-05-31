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
     * Get overlay for aggregated view - now aligned with frontend expectations
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
                    const deviationFlags = this._getDeviationFlags(stats);
                    
                    result.push(new BpmnBlockOverlayReport(
                        this.perspective_name, 
                        element.id, 
                        color, 
                        deviationFlags
                    ));
                } else {
                    // No deviations for this stage - show as normal
                    result.push(new BpmnBlockOverlayReport(
                        this.perspective_name, 
                        element.id, 
                        null, // Green/normal color
                        []
                    ));
                }
            }
        });
        
        return result;
    }

    /**
     * Get deviation flags that match frontend expectations
     * Each flag represents a deviation type with its count and details
     * @param {Object} stats Aggregated statistics
     * @returns {Array} Array of deviation flag objects matching frontend format
     */
    _getDeviationFlags(stats) {
        const deviationFlags = [];
        
        // Convert each deviation type to a flag with count
        for (const [deviationType, count] of stats.counts.entries()) {
            if (count > 0) {
                const severity = this._calculateDeviationSeverity(count, stats.totalInstances);
                
                deviationFlags.push({
                    deviation: deviationType, // This matches what frontend expects
                    details: {
                        count: count,
                        severity: severity,
                        percentage: Math.round((count / stats.totalInstances) * 100),
                        totalInstances: stats.totalInstances,
                        description: this._getDeviationDescription(deviationType, count, stats.totalInstances)
                    }
                });
            }
        }
        
        return deviationFlags;
    }

    /**
     * Calculate severity for a specific deviation type based on its frequency
     * @param {number} count Number of times this deviation occurred
     * @param {number} totalInstances Total number of instances for this stage
     * @returns {string} Severity level
     */
    _calculateDeviationSeverity(count, totalInstances) {
        const percentage = (count / totalInstances) * 100;
        if (percentage >= 75) return 'CRITICAL';
        if (percentage >= 50) return 'HIGH';
        if (percentage >= 25) return 'MEDIUM';
        return 'LOW';
    }

    /**
     * Get human-readable description for deviation
     * @param {string} deviationType Type of deviation
     * @param {number} count Number of occurrences
     * @param {number} totalInstances Total instances
     * @returns {string} Description text
     */
    _getDeviationDescription(deviationType, count, totalInstances) {
        const percentage = Math.round((count / totalInstances) * 100);
        
        const descriptions = {
            'SKIPPED': `Skipped in ${count} out of ${totalInstances} instances (${percentage}%)`,
            'OVERLAP': `Overlapping execution in ${count} out of ${totalInstances} instances (${percentage}%)`,
            'INCOMPLETE': `Incomplete execution in ${count} out of ${totalInstances} instances (${percentage}%)`,
            'MULTI_EXECUTION': `Multiple executions in ${count} out of ${totalInstances} instances (${percentage}%)`,
            'INCORRECT_EXECUTION': `Incorrect execution order in ${count} out of ${totalInstances} instances (${percentage}%)`,
            'INCORRECT_BRANCH': `Wrong branch taken in ${count} out of ${totalInstances} instances (${percentage}%)`
        };
        
        return descriptions[deviationType] || `${deviationType} occurred ${count} times (${percentage}%)`;
    }

    /**
     * Get color based on aggregated severity
     * @param {Object} stats Aggregated statistics
     * @returns {Object} Color object with stroke and fill properties
     */
    _getAggregatedColor(stats) {
        const severity = this._calculateSeverity(stats.deviationRate);
        
        switch (severity) {
            case 'CRITICAL': 
                return { stroke: null, fill: '#FFB6C1' }; // Only fill, no stroke change
            case 'HIGH': 
                return { stroke: null, fill: '#FFB6C1' }; // Only fill, no stroke change
            case 'MEDIUM': 
                return { stroke: null, fill: '#FFE4B5' }; // Only fill, no stroke change
            case 'LOW': 
                return { stroke: null, fill: '#FFFFE0' }; // Only fill, no stroke change
            default: 
                return { stroke: null, fill: '#90EE90' }; // Light green for no deviations
        }
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
        const stageDetails = {};

        for (const [stageId, stats] of this.aggregatedData.entries()) {
            totalStages++;
            if (stats.deviationRate > 0) {
                stagesWithDeviations++;
                totalDeviationRate += stats.deviationRate;
            }
            
            const severity = this._calculateSeverity(stats.deviationRate);
            severityCounts[severity]++;

            // Add stage details for frontend tooltip use
            stageDetails[stageId] = {
                totalInstances: stats.totalInstances,
                instancesWithDeviations: stats.instancesWithDeviations.size,
                deviationRate: stats.deviationRate,
                deviationCounts: Object.fromEntries(stats.counts),
                severity: severity
            };
        }

        return {
            perspective: this.perspective_name,
            totalStages,
            stagesWithDeviations,
            stagesWithoutDeviations: totalStages - stagesWithDeviations,
            averageDeviationRate: stagesWithDeviations > 0 ? (totalDeviationRate / stagesWithDeviations) : 0,
            severityDistribution: severityCounts,
            stageDetails // This enables the frontend tooltips
        };
    }
}

module.exports = { AggregatedBpmnModel };