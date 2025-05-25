var LOG = require('../../../egsm-common/auxiliary/logManager')
var CONNCOMM = require('../../../egsm-common/config/connectionconfig')
const { ProcessNotification } = require('../../../egsm-common/auxiliary/primitives')
const { Validator } = require('../../../egsm-common/auxiliary/validator')
const { Job } = require('../job')
const { ProcessPerspective } = require('./process-perspective')
const { SkipDeviation, IncompleteDeviation } = require("./process-perspective");

module.id = "BPMN"

// Import performance tracker
let performanceTracker;
try {
  performanceTracker = require('../../../egsm-common/monitoring/performanceTracker');
} catch (e) {
  performanceTracker = null;
  LOG.logSystem('WARNING', 'Performance tracker not available in BpmnJob: ' + e.message, module.id);
}

/**
 * Job to perform automated deviation detection on a process instance
 * and to provide functionalities for visualization on the front-end
 */
class BpmnJob extends Job {
  constructor(id, brokers, owner, monitored, monitoredprocessgroups, notificationrules, notificationmanager, perspectives) {
    super(id, 'bpmn', brokers, owner, monitored, monitoredprocessgroups, [], notificationrules, notificationmanager)
    this.perspectives = new Map()

    perspectives.forEach(element => {
      LOG.logSystem('DEBUG', `Loading perspective: ${element.perspective_name}`, module.id)
      this.perspectives.set(element.perspective_name, new ProcessPerspective(element.perspective_name, element.perspective_path))
    });
  }

  /**
   * Extract event ID from message object for performance tracking
   */
  extractEventId(messageObj) {
    // Try multiple possible event ID fields
    if (messageObj._eventId) return messageObj._eventId;
    if (messageObj.eventId) return messageObj.eventId;
    if (messageObj.event_id) return messageObj.event_id;
    return null;
  }

  /**
   * Called automatically when a process event received from the monitored process 
   * @param {Object} messageObj received process event object 
   */
  onProcessEvent(messageObj) {
    console.log(messageObj)

    // Performance tracking: Record that aggregator received an event
    const eventId = this.extractEventId(messageObj);
    
    if (performanceTracker && eventId) {
      performanceTracker.recordEvent(eventId, 'aggregator_received', {
        jobId: this.id,
        processType: messageObj.process_type,
        processId: messageObj.process_id,
        perspective: messageObj.process_perspective,
        eventType: messageObj.hasOwnProperty('condition') ? 'condition' : 'stage_update',
        stageName: messageObj.stage_name
      });
    }

    var process = messageObj.process_type + '/' + messageObj.process_id + '__' + messageObj.process_perspective
    if (!this.monitoredprocesses.has(process)) {
      return;
    }

    if (!this.perspectives.has(messageObj.process_perspective)) {
      return;
    }

    var perspective = this.perspectives.get(messageObj.process_perspective)
    var egsm = perspective.egsm_model
    var isConditionEvent = messageObj.hasOwnProperty('condition')

    let deviations = [];

    if (isConditionEvent) {
      egsm.recordStageCondition(messageObj.stage_name, messageObj.condition)
      
      // Track completion for condition events
      if (performanceTracker && eventId) {
        performanceTracker.recordEvent(eventId, 'detection_complete', {
          result: 'condition_recorded',
          jobId: this.id
        });
      }
    } else {
      if (!egsm.stages.has(messageObj.stage_name)) {
        return;
      }

      if (messageObj.state == 'opened') {
        messageObj.state = 'open'
      }

      egsm.updateStage(messageObj.stage_name, messageObj.status.toUpperCase(), messageObj.state.toUpperCase(), messageObj.compliance.toUpperCase())
      perspective.egsm_model.stages.forEach(stage => stage.cleanPropagations())

      // This is the key deviation detection call
      deviations = perspective.analyze()

      // Track detection completion
      if (performanceTracker && eventId) {
        performanceTracker.recordEvent(eventId, 'detection_complete', {
          result: 'success',
          deviationCount: deviations ? deviations.length : 0,
          jobId: this.id,
          perspective: messageObj.process_perspective,
          stageName: messageObj.stage_name
        });
      }

      this.triggerCompleteUpdateEvent()
      console.log(deviations)
    }

    // Validation code (commented out in original)
    /*var errors = Validator.validateProcessStage(messageObj.stage)
    if (errors.length > 0) {
        console.debug(`Faulty stage of process [${messageObj.processtype}/${messageObj.instanceid}]__${messageObj.perspective} detected: ${JSON.stringify(errors)}`)
        var message = `Process deviation detected at [${messageObj.processtype}/${messageObj.instanceid}]__${messageObj.perspective}]!`
        var notification = new ProcessNotification(this.id, CONNCOMM.getConfig().self_id, message, messageObj.processtype, messageObj.instanceid, messageObj.perspective, [...this.monitoredprocesses], errors)
        this.notificationmanager.notifyEntities(notification, this.notificationrules)
    }*/
  }

  /**
   * Returns with the up-to-date version of the BPMN xml definition
   * @returns BPMN.xml
   */
  getBpmnDiagrams() {
    var resultPerspectives = []
    this.perspectives.forEach(element => {
      resultPerspectives.push({
        name: element.perspective_name,
        bpmn_xml: element.bpmn_model.model_xml
      })
    });
    var result = {
      job_id: this.id,
      perspectives: resultPerspectives,
    }
    return result
  }

  /**
   * Returns with the up-to-date overlays, which should be applied on the BPMN diagram
   * to visualize the current state of the process instance
   * @returns List of overlay reports
   */
  getBpmnOverlay() {
    var overlays = []
    this.perspectives.forEach(element => {
      element.analyze()
      overlays = overlays.concat(element.bpmn_model.getOverlay())
    });
    var result = {
      job_id: this.id,
      overlays: overlays
    }
    return result
  }

  /**
   * Complete update for the front-end
   * @returns Returns with an object which contains the up-to-date BPMN.xml
   * and the overlays
   */
  getCompleteUpdate() {
    var overlays = []
    var resultPerspectives = []
    this.perspectives.forEach(element => {
      resultPerspectives.push({
        name: element.perspective_name,
        bpmn_xml: element.bpmn_model.getModelXml()
      })
    });
    this.perspectives.forEach(element => {
      element.analyze()
      overlays = overlays.concat(element.bpmn_model.getOverlay())
    });
    var result = {
      job_id: this.id,
      perspectives: resultPerspectives,
      overlays: overlays
    }
    return result
  }

  /**
   * Triggers an whole update for the front-end
   */
  triggerCompleteUpdateEvent() {
    // Performance tracking: Track frontend update event
    const updateData = this.getCompleteUpdate();
    this.eventEmitter.emit('job-update', updateData)
  }
}

// Add graceful shutdown to export data
process.on('SIGINT', () => {
  if (performanceTracker) {
    performanceTracker.exportToFile();
  }
  process.exit(0);
});

module.exports = {
  BpmnJob
}