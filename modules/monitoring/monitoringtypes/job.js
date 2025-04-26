const schedule = require('node-schedule');
const OBSERVER = require('../engineobserver')
const GROUPMAN = require('../groupmanager')
var EventEmitter = require('events')

/**
 * Superclass of Job classes
 */
class Job {
    /**
     * 
     * @param {String} id Job ID 
     * @param {String} jobtype Type of Job
     * @param {Broker[]} brokers Brokers to monitor
     * @param {String} owner Owner of the Job
     * @param {String[]} monitored Monitored Process Instances
     * @param {String[]} monitoredprocessgroups Monitored Process Groups
     * @param {String[]} monitoredartifacts Monitored Artifacts
     * @param {Object} notificationrules Notification Rules
     * @param {Object} notificationmanager Applied Notification Manager
     */
    constructor(id, jobtype, brokers, owner, monitored, monitoredprocessgroups, monitoredartifacts, notificationrules, notificationmanager) {
        this.id = id
        this.job_type = jobtype
        this.owner = owner
        this.started = Date.now() / 1000
        this.monitoredprocesses = new Set()
        this.monitoredprocessgroups = monitoredprocessgroups
        this.monitoredartifacts = monitoredartifacts
        this.notificationrules = notificationrules
        this.notificationmanager = notificationmanager
        this.eventEmitter = new EventEmitter();

        this.brokers = brokers
        this.brokers.forEach(element => {
            OBSERVER.addMonitoredBroker(element)
        });
        this.periodiccalls = []

        //Add processes which are static defined for monitoring
        for (var process of monitored) {
            this.addMonitoredProcess(process)
        }

        //Extend the 'monitoredprocesses' set with processes from the provided process groups
        //and subscribe to changes in these process groups
        this.monitoredprocessgroups.forEach(element => {
            GROUPMAN.subscribeGroupChanges(element, this.onGroupChange.bind(this)).then((memberProcesses) => {
                for (var process of memberProcesses) {
                    this.addMonitoredProcess(process)
                }
            })
        });
    }

    /**
     * Adding new Proces to the Monitoring Job
     * @param {String} processid Process ID of the new Monitored Process 
     */
    addMonitoredProcess(processid) {
        if (this.monitoredprocesses.has(processid)) {
            console.warn('Cannot add same process instance twice')
            return
        }
        this.monitoredprocesses.add(processid)
        OBSERVER.addProcess(processid, this.onProcessEvent.bind(this))
    }

    /**
     * Remove a Process from the Monitoring Job
     * @param {String} processid ID of the Process Instance to remove 
     */
    removeMonitoredProcess(processid) {
        if (!this.monitoredprocesses.has(processid)) {
            console.warn('Cannot remove non-added process instance')
            return
        }
        this.monitoredprocesses.delete(processid)
        OBSERVER.removeProcess(processid, this.onProcessEvent.bind(this))
    }
    
    getExtract(){
        return undefined
    }

    /**
     * Terminate the Job
     */
    terminate() {
        //Stop all periodic calls
        this.periodiccalls.forEach(element => {
            element.cancel()
        });
        this.periodiccalls = []

        //Unsubscribe from group changes
        this.monitoredprocessgroups.forEach(element => {
            GROUPMAN.unsubscribeGroupChanges(element, this.onGroupChange.bind(this))
        });

        //Unsubscribe from engine updates
        this.monitoredprocesses.forEach(element => {
            this.removeMonitoredProcess(element)
            //OBSERVER.removeProcess(element, onProcessEvent.bind(this))
        });
    }

    /**
     * Sets up a periodic function call
     * The 'functionref' will be called in every 'period' seconds until the job is not terminated
     * @param {Object} functionref Reference to the function
     * @param {Number} period Frequency of call
     */
    setPeriodicCall(functionref, period) {
        this.periodiccalls.push(schedule.scheduleJob(` */${period} * * * * *`, functionref))
    }

    /**
     * Called By the EngineObserver in case of a Process event to job subscribed to before
     * @param {Object} message The message Object itself
     */
    onProcessEvent(message) {
        console.warn('This function should be overwritten')
    }

    /**
     * Notifies Stakeholders
     * @param {String} processtype Type of the Process 
     * @param {String} instanceid Instance ID of the Process
     * @param {String} processperspective Process Perspective
     * @param {Object} errors Object containing Errors
     */
    notifyStakeholders(processtype, instanceid, processperspective, errors) {
        this.notificationmanager.notify(this.id, this.notificationrules, [...this.monitoredprocesses], this.monitoredartifacts, processtype, instanceid, processperspective, errors)
    }

    /**
     * Called by the GroupManager, when a change has been detected regarding any group used by the Job
     * The function will add or remove 'processid' from the monitored_processes
     * @param {String} processid ID of the process 
     * @param {Object} event Process Event (created/destructed)
     */
    onGroupChange(processid, event) {
        if (event.type == 'created') {
            this.addMonitoredProcess(processid)
        }
        else if (event.type == 'destructed') {
            this.removeMonitoredProcess(processid)
        }
    }
}

module.exports = { Job }
