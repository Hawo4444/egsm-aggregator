var LOG = require('../../../egsm-common/auxiliary/logManager')
var CONNCOMM = require('../../../egsm-common/config/connectionconfig')
const { ProcessNotification } = require('../../../egsm-common/auxiliary/primitives')
const { Validator } = require('../../../egsm-common/auxiliary/validator')
const { Job } = require('../job')
const { ProcessPerspective } = require('./process-perspective')
const { SkipDeviation, IncompleteDeviation } = require("./process-perspective");
const performanceTracker = require('../../../egsm-common/monitoring/performanceTracker');

module.id = "BPMN"

/**
 * Job to perform automated deviation detection on a process instance
 * and to provide functionalities for visualization on the front-end
 */
class BpmnJob extends Job {
  constructor(id, brokers, owner, monitored, monitoredprocessgroups, notificationrules, notificationmanager, perspectives) {
    super(id, 'bpmn', brokers, owner, monitored, monitoredprocessgroups, [], notificationrules, notificationmanager)
    this.perspectives = new Map()

    perspectives.forEach(element => {
      this.perspectives.set(element.name, new ProcessPerspective(element.name, element.egsm_model, element.bpmn_diagram))
    });
  }

  /**
   * Called automatically when a process event received from the monitored process 
   * @param {Object} messageObj received process event object 
   */
  onProcessEvent(messageObj) {
    console.log(messageObj)
    if (messageObj.correlationId) {
      performanceTracker.recordEvent(messageObj.correlationId, 'aggregator_received', {
        process: `${messageObj.process_type}/${messageObj.process_id}__${messageObj.process_perspective}`,
        stage: messageObj.stage_name || 'unknown'
      });
    }
    var process = messageObj.process_type + '/' + messageObj.process_id + '__' + messageObj.process_perspective
    if (!this.monitoredprocesses.has(process))
      return
    if (!this.perspectives.has(messageObj.process_perspective))
      return
    var perspective = this.perspectives.get(messageObj.process_perspective)
    var egsm = perspective.egsm_model
    var isConditionEvent = messageObj.hasOwnProperty('condition')
    if (isConditionEvent) {
      egsm.recordStageCondition(messageObj.stage_name, messageObj.condition)
    } else {
      if (!egsm.stages.has(messageObj.stage_name))
        return
      if (messageObj.state == 'opened') {
        messageObj.state = 'open'
      }
      egsm.updateStage(messageObj.stage_name, messageObj.status.toUpperCase(), messageObj.state.toUpperCase(), messageObj.compliance.toUpperCase())
      perspective.egsm_model.stages.forEach(stage => stage.cleanPropagations())
      var deviations = perspective.analyze()

      if (messageObj.correlationId) {
        performanceTracker.recordEvent(messageObj.correlationId, 'aggregator_analyzed', {
          process: process,
          deviations: deviations ? deviations.length : 0
        });
      }

      this.triggerCompleteUpdateEvent()
      console.log(deviations)
    }

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
   * @returns Returns with an object which contains the up-to-date BPMN.cml
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
    this.eventEmitter.emit('job-update', this.getCompleteUpdate())
  }
}

module.exports = {
  BpmnJob
}