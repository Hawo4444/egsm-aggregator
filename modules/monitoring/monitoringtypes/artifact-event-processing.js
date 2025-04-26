var DB = require('../../egsm-common/database/databaseconnector')
var LOG = require('../../egsm-common/auxiliary/logManager')
const { Job } = require('./job')

module.id = "ARTIFACT_EV_PRO"

/**
 * A type of Daemon Jobs, performing Artifact Event processing periodically
 * Every time the preset time elapses, it wakes up, retrieves all unprocessed Artifact Event from the Database, then it
 * tries to form pairs of events (attached + detached). If a pair has been created it verifies if the regarding Process instance
 * is already terminated. If yes then it will set the two events to 'Processed' in the Database and it will add a new Entry to the 
 * 'Artifact Usage' table, referencing the two Events and the Process Instance.  
 */
class ArtifactEventProcessing extends Job {
    static initialized = false
    /**
     * @param {String} id ID of the Job 
     * @param {String} owner Owner of the Job (e.g.: Stakeholder)
     * @param {Number} frequency Frequency of the daemon activity (how often (in seconds) should it check for new events)
     */
    constructor(id, owner, frequency) {
        if (ArtifactEventProcessing.initialized) {
            throw new Error('ArtifactEventProcessing is not allowed to start twice!');
        }
        super(id, 'artifact-event-processing', [], owner, [], [], [], [], undefined)
        this.frequency = frequency
        this.setPeriodicCall(this.onPeriodElapsed.bind(this), frequency)
        this.initialized = true
    }

    /**
     * Called automatically everytime when the sleeping period elapsed
     */
    onPeriodElapsed() {
        //Reading all unprocessed Artifact events from the DB
        DB.readUnprocessedArtifactEvents().then(async (data) => {
            console.log(data)
            var affectedArtifacts = new Map()
            var affectedProcessMap = new Map()
            var promises = []
            data.forEach(entry => {
                promises.push(this.checkArtifactDefinition(affectedArtifacts, entry.artifact_name, promises))
                promises.push(this.checkProcessInstanceState(affectedProcessMap, entry.process_type, entry.process_id))
            });
            await Promise.all(promises)
            //Iterating through all entries and considering only the ones regarding defined Artifacts and Process instances which are already finsihed
            //Trying to compose pairs of entries
            var pairs = new Map()
            data.forEach(entry => {
                if (affectedArtifacts.get(entry.artifact_name) && affectedProcessMap.get(entry.process_type + '/' + entry.process_id).status == 'finished') {
                    pairs.set(entry.artifact_name + '___' + entry.event_id, { entry: entry, pair: undefined })
                }
            });
            for (let [keyAttached, entryAttached] of pairs) {
                for (let [keyDetached, entryDetached] of pairs) {
                    //Pair is not found yet for the keyAttached AND
                    if (entryAttached.pair == undefined &&
                        entryAttached.entry.artifact_state == 'attached' &&
                        entryDetached.entry.artifact_state == 'detached' &&
                        entryAttached.entry.process_type == entryDetached.entry.process_type &&
                        entryAttached.entry.process_id == entryDetached.entry.process_id &&
                        entryAttached.entry.artifact_name == entryDetached.entry.artifact_name) {
                        entryAttached.pair = entryDetached.entry
                        pairs.delete(keyDetached)
                        break;
                    }
                }
            }

            //Generate new ID-s based on the 2 used entries
            for (let [key, entry] of pairs) {
                if (entry.pair != undefined) {
                    var case_id = entry.entry.event_id + '_' + entry.pair.event_id
                    //Add the case to the ARTIFACT_USAGE table
                    DB.writeArtifactUsageEntry(entry.entry.artifact_name, case_id, entry.entry.timestamp, entry.pair.timestamp,
                        entry.entry.process_type, entry.entry.process_id, affectedProcessMap.get(entry.entry.process_type + '/' + entry.entry.process_id).outcome)
                    //Set Events to processed in DB    
                    DB.setArtifactEventToProcessed(entry.entry.artifact_name, entry.entry.event_id)
                    DB.setArtifactEventToProcessed(entry.pair.artifact_name, entry.pair.event_id)

                }
            }
        })
    }

    /**
     * Function helps to reduce Database Access when retrieving Artifact Definitions
     * 'artifactdefinitionmap' attribute is a map, which contains a set of Artifacts
     * if the Artifact specified by 'artifactname' is already in the map, then the function will not retrieve its details from the database
     * otherwise it will wait for it and add it to the map
     * @param {Map} artifactdefinitionmap Map containing Artifact information
     * @param {String} artifactname Name of the requested Artifact
     * @returns A Promise will be resolved when the requested information becomes available
     */
    checkArtifactDefinition(artifactdefinitionmap, artifactname) {
        return new Promise(function (resolve, reject) {
            if (artifactdefinitionmap.has(artifactname)) {
                return resolve()
            }
            artifactdefinitionmap.set(artifactname, false)
            var elements = artifactname.split('/')
            DB.isArtifactDefined(elements[0], elements[1]).then((result) => {
                artifactdefinitionmap.set(artifactname, result)
                resolve()
            })
        });
    }

    /**
     * Function helps to reduce Database Access when retrieving Process Instance Definitions
     * 'processmap' attribute is a map, which contains a set of Process Instances
     * if the Artifact specified by 'processtype' and 'instanceid' is already in the map, then the function will not retrieve its details from the database
     * otherwise it will wait for it and add it to the map
     * @param {Map} processmap Map containing Process Instances 
     * @param {String} processtype Type of the requested Process Instance 
     * @param {String} instanceid Instance ID of the requested Process Instance
     * @returns A Promise will be resolved when the requested information becomes available
     */
    checkProcessInstanceState(processmap, processtype, instanceid) {
        return new Promise(function (resolve, reject) {
            var processName = processtype + '/' + instanceid
            if (processmap.has(processName)) {
                return resolve()
            }
            processmap.set(processName, undefined)
            DB.readProcessInstance(processtype, instanceid).then((result) => {
                processmap.set(processName, result)
                resolve()
            })
        });
    }
}
module.exports = {
    ArtifactEventProcessing
}