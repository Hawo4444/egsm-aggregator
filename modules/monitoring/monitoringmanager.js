var LOG = require('../egsm-common/auxiliary/logManager')

var MQTTCOMM = require('../communication/mqttcommunication')
var CONNCONFIG = require('../egsm-common/config/connectionconfig')
const { JobFactory } = require('./jobfactory');
const { NotificationManager } = require('../communication/notificationmanager');

const MAX_JOBS = 500

module.id = "MONITORMAN"

/**
 * Singleton class handling the lifecycle of Jobs and Job-related Objects
 */
class MonitoringManager {
    constructor() {
        this.notification_manager = new NotificationManager()
        this.job_factory = new JobFactory(this.notification_manager)
        this.instance = undefined
        this.jobs = new Map()
    }

    /**
     * Starting a new Job based on the provided configuration
     * @param {Object} jobconfig Job configuration Object should contain all necessary data attributes
     */
    startJob(jobconfig) {
        var newjob = this.job_factory.buildJob(jobconfig)
        if (newjob) {
            LOG.logSystem('DEBUG', `New job [${jobconfig.id}] started`, module.id)
            this.jobs.set(jobconfig.id, newjob)
            return
        }
        LOG.logSystem('WARNING', `Could not start Monitoring Activity...`, module.id)
    }

    /**
     * Terminates a specified Job
     * @param {String} jobid ID of the Job to terminate 
     */
    stopJob(jobid) {
        if (this.jobs.has(jobid)) {
            LOG.logSystem('DEBUG', `Stopping Monitoring Activity ${jobid}`, module.id)
            this.jobs.get(jobid).terminate()
            this.jobs.delete(jobid)
            return
        }
        LOG.logSystem('WARNING', `Monitoring Activity ${jobid} is not defined, cannot be removed`, module.id)
    }

    /**
     * Get a list of jobs
     */
    getAllJobs() {

    }

    /**
     * Get details of a specified Job
     * @param {String} jobid ID of the Job whose details are requested  
     * @returns Job instance or 'undefined' in case of not found
     */
    getJob(jobid) {
        if (this.jobs.has(jobid)) {
            return this.jobs.get(jobid)
        }
        return undefined
    }

    /**
     * Get Details of a job in a special format
     * @param {String} jobid ID of the Job whose details are requested  
     * @returns A prepared Object containing certain details of the Job and the Aggregator instance as well ('undefined' in case of not found)
     */
    getJobInfo(jobid) {
        if (this.jobs.has(jobid)) {
            console.log('JOB FOUND')
            return {
                job_id: jobid,
                owner: this.jobs.get(jobid).owner,
                host: CONNCONFIG.getConfig().socket_host,
                port: CONNCONFIG.getConfig().socket_port,
                extract: this.jobs.get(jobid).getExtract()
            }
        }
        console.warn('Job id not found ' + jobid)
        return undefined
    }

    /**
     * Check if the MonitoringManager has free Job slot
     * @returns True if it has free slot, false otherwise
     */
    hasFreeSlot() {
        if (this.jobs.size < MAX_JOBS) {
            return true
        }
        return false
    }

    /**
     * Get the maximum Job capacity (maximum number of Jobs allowed to be deployed at the same time)
     * @returns The maximum Job capacity of the MonitoringManager 
     */
    getCapacity() {
        return MAX_JOBS
    }

    /**
     * Get the number of currently deployed Jobs
     * @returns Number of currently Deployed Jobs
     */
    getNumberOfJobs() {
        return this.jobs.size
    }

    /**
     * Get the number of currently deployed Jobs
     * @returns Number of currently Deployed Jobs
     */
    getDeviationAggregationJobs() {
        let jobs = []
        for (let [_, value] of this.jobs) {
            if (value.job_type === 'process-deviation-aggregation') {
                jobs.push({
                    id: value.id,
                    job_type: value.job_type,
                    processType: value.processType,
                    brokers: [{
                        host: CONNCONFIG.getConfig().socket_host,
                        port: CONNCONFIG.getConfig().socket_port
                    }]
                })
            }
        }
        return jobs
    }

    /**
     * Get Singleton instance
     * @returns Returns the singleton instance of MonitoringManager
     */
    static getInstance() {
        if (!MonitoringManager.instance) {
            MonitoringManager.instance = new MonitoringManager();
            MQTTCOMM.setMonitoringManager(MonitoringManager.instance)
        }
        return MonitoringManager.instance;
    }
}

module.exports = {
    MonitoringManager
}