const { ArtifactEventProcessing } = require('./monitoringtypes/artifact-event-processing')
const { ArtifactUsageStatisticProcessing } = require("./monitoringtypes/artifact-usage-statistic-processing")
const { ArtifactUnreliabilityAlert } = require("./monitoringtypes/artifact-unreliability-alert")
const { ProcessDeviationDetection } = require("./monitoringtypes/process-deviation-detection")
const { RealTimeProcessAggregation } = require('./monitoringtypes/real-time-process-aggregation')
const { ProcessDeviationAggregation } = require('./monitoringtypes/process-deviation-aggregation');

var CONNCONF = require('../egsm-common/config/connectionconfig')
const { BpmnJob } = require("./monitoringtypes/bpmn/bpmn-job")

/**
 * Factory class to create Job instances based on the provided configuration
 */
class JobFactory {
    /**
     * @param {Object} notificationmanager Reference to the NotificationManager instance intended to be used by the created Jobs 
     */
    constructor(notificationmanager) {
        this.notification_manager = notificationmanager
    }

    /**
     * Creates a new Job based on the provided 'config' attribute 
     * @param {Object} config Configuration Object containing all necessary attributes to build a job
     * @returns A new Job object
     */
    buildJob(config) {
        //Considering config contains the config of 1 job only
        try {
            var id = config['id']
            var owner = config['owner']
            switch (config['type']) {
                case 'artifact-event-processing': {
                    var frequency = config['frequency']
                    return new ArtifactEventProcessing(id, owner, frequency)
                }
                case 'artifact-usage-statistic-processing': {
                    var monitoredartifacts = config['monitoredartifacts']
                    var frequency = config['frequency']
                    return new ArtifactUsageStatisticProcessing(id, owner, monitoredartifacts, frequency)
                }
                case 'artifact-unreliability-alert': {
                    var monitoredartifacts = config['monitoredartifacts']
                    var faultinessthreshold = config['faultinessthreshold']
                    var windowsize = config['windowsize']
                    var frequency = config['frequency']
                    var notificationrules = config['notificationrules']
                    return new ArtifactUnreliabilityAlert(id, owner, monitoredartifacts, faultinessthreshold, windowsize, frequency, notificationrules, this.notification_manager)
                }
                case 'process-deviation-detection': {
                    //var brokers = config['brokers']
                    var brokers = [CONNCONF.getConfig().primary_broker]
                    var monitored = config['monitored']
                    var monitoredprocessgroups = config['monitoredprocessgroups']
                    var notificationrules = config['notificationrules']
                    return new ProcessDeviationDetection(id, brokers, owner, monitored, monitoredprocessgroups, notificationrules, this.notification_manager)
                }
                case 'bpmn-job': {
                    var brokers = [CONNCONF.getConfig().primary_broker]
                    var monitored = config['monitored']
                    var notificationrules = config['notificationrules']
                    var perspectives = config['perspectives']
                    return new BpmnJob(id, brokers, owner, monitored, [], notificationrules, this.notification_manager, perspectives)
                }
                case 'real-time-process-aggregation': {
                    var brokers = [CONNCONF.getConfig().primary_broker]
                    var processtype = config['processtype']
                    var notificationrules = config['notificationrules']
                    return new RealTimeProcessAggregation(id, brokers, owner, processtype, notificationrules, this.notification_manager)
                }
                case 'process-deviation-aggregation': {
                    var brokers = [CONNCONF.getConfig().primary_broker]
                    var processtype = config['processtype']
                    var perspectives = config['perspectives']
                    var notificationrules = config['notificationrules']
                    return new ProcessDeviationAggregation(id, brokers, owner, processtype, perspectives, notificationrules, this.notification_manager)
                }
                //Add further types when implemented!
                default:
                    return undefined
            }
        } catch (error) {
            console.warn(error)
            return undefined
        }
    }
}

module.exports = {
    JobFactory
}