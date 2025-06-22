/**
 * Module responsible for storing process deviations to the database
 * Receives deviation messages via mqttcommunication module
 */

const LOG = require('../egsm-common/auxiliary/logManager');
const DDB = require('../egsm-common/database/databaseconnector');

module.id = "DEVLOG";

/**
 * Handle deviation message and store to database
 * @param {Object} messageObj Deviation message object
 */
function handleDeviations(messageObj) {
    try {
        if (!messageObj.process_type || !messageObj.process_id || !messageObj.process_perspective) {
            LOG.logWorker('WARNING', 'Invalid deviation message: missing required fields', module.id);
            return;
        }

        // Only store if there are actual deviations
        if (!messageObj.deviations || messageObj.deviations.length === 0) {
            LOG.logWorker('DEBUG', `No deviations to store for ${messageObj.process_type}/${messageObj.process_id}__${messageObj.process_perspective}`, module.id);
            return;
        }

        DDB.storeProcessDeviations(
            messageObj.process_type, 
            messageObj.process_id, 
            messageObj.process_perspective, 
            messageObj.deviations
        );

        LOG.logWorker('DEBUG', 
            `Stored ${messageObj.deviations.length} deviations for ${messageObj.process_type}/${messageObj.process_id}__${messageObj.process_perspective}`, 
            module.id
        );
        
    } catch (error) {
        LOG.logWorker('ERROR', `Failed to store deviations: ${error.message}`, module.id);
    }
}

module.exports = {
    handleDeviations: handleDeviations
};