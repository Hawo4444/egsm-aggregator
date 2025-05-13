var LOG = require('../../egsm-common/auxiliary/logManager')
var CONNCOMM = require('../../egsm-common/config/connectionconfig')
const { ProcessNotification } = require('../../egsm-common/auxiliary/primitives')
const { Validator } = require('../../egsm-common/auxiliary/validator')
const { Job } = require('./job')

module.id = "PRO_DEV_DET"

/**
 * Job type detects deviations of Processes and send immediate notifications based on Notifiaction Rules
 */
class ProcessDeviationDetection extends Job {
    /**
     * @param {String} id Job ID
     * @param {Broker} brokers Monitored Brokers
     * @param {String} owner Owner of the Job
     * @param {String[]} monitored List of Monitored Processes
     * @param {String[]} monitoredprocessgroups List of Monitored Process Groups
     * @param {Object} notificationrules Applied Notification Rules
     * @param {Object} notificationmanager Applied Notification Manager
     */
    constructor(id, brokers, owner, monitored, monitoredprocessgroups, notificationrules, notificationmanager) {
        super(id, 'process-deviation-detection', brokers, owner, monitored, monitoredprocessgroups, [], notificationrules, notificationmanager)
    }

    /**
     * Called when the EngineObserver receives an event from the Process
     * @param {Object} messageObj The Event Object 
     */
    onProcessEvent(messageObj) {
        if (messageObj.hasOwnProperty('condition'))
            return
        var errors = Validator.validateProcessStage(messageObj.stage)
        if (errors.length > 0) {
            console.debug(`Faulty stage of process [${messageObj.processtype}/${messageObj.instanceid}]__${messageObj.perspective} detected: ${JSON.stringify(errors)}`)
            var message = `Process deviation detected at [${messageObj.processtype}/${messageObj.instanceid}]__${messageObj.perspective}]!`
            var notification = new ProcessNotification(this.id, CONNCOMM.getConfig().self_id, this.job_type, message, messageObj.processtype, messageObj.instanceid, messageObj.perspective, [...this.monitoredprocesses], errors)
            this.notificationmanager.notifyEntities(notification, this.notificationrules)
        }
    }
}

module.exports = {
    ProcessDeviationDetection
}