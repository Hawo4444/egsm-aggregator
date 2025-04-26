/**
 * Class responsible for notifying Stakeholders about Job Notificaations based on a provided set of Notification Rules 
 */
var LOG = require('../egsm-common/auxiliary/logManager')
var DDB = require('../egsm-common/database/databaseconnector')
var MQTT = require('../egsm-common/communication/mqttconnector')
var CONNCONFIG = require('../egsm-common/config/connectionconfig')

module.id = 'NOTIFMAN'

class NotificationManager {
    constructor() { }

    /**
     * Sends 'notification' to certain Stakeholders based on the 'notificationrules' attribute
     * @param {Object} notification The notification Object itself containing all related attributes
     * @param {Object} notificationrules A set of rules specifying a group of Stakeholders the notification intended for
     */
    async notifyEntities(notification, notificationrules) {
        notification.notified = new Set()
        var promises = []
        switch (notification.type) {
            case 'artifact':
                notificationrules.forEach(rule => {
                    switch (rule) {
                        case 'ARTIFACT_OWNERS':
                            //Get the owner(s) of the artifact from the database
                            promises.push(new Promise((resolve) => {
                                DDB.readArtifactDefinition(notification.artifact_type, notification.artifact_id).then((artifact) => {
                                    artifact.stakeholders.forEach(stakeholder => {
                                        notification.notified.add(stakeholder)
                                        resolve()
                                    });
                                })
                            }))
                            break;
                        case 'PROCESS_OWNERS':
                            //TODO: Here it should notify the owners of Process Instances using the Artifact included in the notification
                            //It is not-resolved to have an 'attached_processes' attribute for each Artifact Instances in the database, since
                            //the same attribute should be maintained by multiple Workers and it could lead to uncertainties
                            //Another (and probably more feasible) approach is to perform Process Discovery trhough MQTT (similarly to 'discoverProcessGroupMembers')
                            break;
                    }
                });
                break;
            case 'process':
                notificationrules.forEach(rule => {
                    switch (rule) {
                        case 'ARTIFACT_OWNERS':
                            //TODO: Here it should notify the owners of each Artifact which is attached to the Process instance
                            //The list of currently attached Artifacts to a certain Process Instance is not available
                            //As an alternative the featrue can be implemented through Process Discovery as well (similarly to 'discoverProcessGroupMembers') 
                            break;
                        case 'PROCESS_OWNERS':
                            //Notifify the Stakeholders of the Process Instance included in the Notification
                            promises.push(new Promise((resolve) => {
                                DDB.readProcessInstance(notification.process_type, notification.process_id).then((process) => {
                                    notification.notified.add(process.stakeholders)
                                    resolve()
                                })
                            }))
                            break;
                        case 'PROCESS_GROUP_MEMBERS':
                            //Notify all process owners who has process in the process group where the issued process is also a member
                            notification.processgroupmembers.forEach(memberprocess => {
                                promises.push(new Promise((resolve) => {
                                    DDB.readProcessInstance(memberprocess.process_type, memberprocess.process_id).then((process) => {
                                        notification.notified.add(process.stakeholders)
                                        resolve()
                                    })
                                }))
                            });

                            break;
                        case 'PEER_ARTIFACT_USERS':
                            //TODO: Notify here the stakeholders of processes who are using the same artifact(s) as the faulty process
                            //It should be implemented through Process Discovery and the part of the necessary features will be available in artifact -> 'PROCESS_OWNERS' 
                            break;
                    }
                });
                break;
        }
        await Promise.all(promises)
        notification.notified = [...notification.notified]
        notification.notified.forEach(entry => {
            this.notifyStakeholder(entry, notification)
        });
    }
    /**
     * Sends a notification to a Stakeholder
     * @param {string} stakeholdername - The ID of a Stakeholder, which in advance needs to be registered into the database, with the desired notification method and notification credentials  
     * @param {string} notification - The notification payload itself
     */
    notifyStakeholder(stakeholdername, notification) {
        DDB.readStakeholder(stakeholdername).then((data, err) => {
            if (err) {
                LOG.logSystem('ERROR', `Error while retrieving information about ${stakeholdername}`, module.id)
                resolve()
            }
            if (data == undefined) {
                LOG.logSystem('ERROR', `Could not find Stakeholder ${stakeholdername} in database`, module.id)
                resolve()
            }
            else {
                //NOTE: For now only notification through MQTT is supported
                //Notification is published to: [Stakeholder Name]/notification topic
                var notificationJson = JSON.stringify(notification)
                var broker = CONNCONFIG.getConfig().primary_broker
                MQTT.publishTopic(broker.host, broker.port, 'notification/' + stakeholdername, notificationJson)
            }
        })
    }
}

module.exports = {
    NotificationManager
}