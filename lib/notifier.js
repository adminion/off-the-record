"use strict";

let debug = require('debug')('off-the-record:notifier');
let shortId = require('shortid');
let notie = require('notie');

const DEFAULT_DURATION = 5;

const ALERT   = 'alert';
const CONFIRM = 'confirm';
const INPUT  = 'input';

const SUCCESS = 1;
const WARNING = 2;
const ERROR   = 3;
const INFO    = 4;

class Notification {
  constructor (date = Date.now()) {
    this.id = shortId.generate();
    this.date = date;
    this.acknowledged = false;

    debug('this', this);
  }

  acknowledge () {

    debug('notification acknowledged', this.id);

    this.acknowledged = true;
    return Object.freeze(this);
  }
}

class Notification_Alert extends Notification {
  constructor ({ style = INFO, message, duration = DEFAULT_DURATION }) {

    super();

    this.style = style;
    this.message = message;
    this.duration = duration

    debug('this', this);

  }

<<<<<<< Updated upstream
  static get styles () {
    return {
      SUCCESS,
      WARNING,
      ERROR,
      INFO
    }
  }
=======
  static get SUCCESS () {
    return SUCCESS;
  }

  static get WARNING () {
    return WARNING;
  }

  static get ERROR () {
    return ERROR;
  }

  static get INFO () {
    return INFO;
  }
  
>>>>>>> Stashed changes
}

class Notification_Confirm extends Notification {
  constructor (message, yesBtnText, noBtnText, yesCallback = function () {}) {

    super();

    this.message = message;
    this.yesBtnText = yesBtnText;
    this.noBtnText = noBtnText;
    this.yesCallback = yesCallback;

    debug('this', this);

  }
}

class Notification_Input extends Notification {
  constructor ({message, submitBtnText, cancelBtnText, type = 'text', placeholder = '', submitCallback = function () {}, preFill = ''} = {}) {

    super();

    this.message = message;
    this.submitBtnText = submitBtnText;
    this.cancelBtnText = cancelBtnText;
    this.type = type;
    this.placeholder = placeholder;
    this.submitCallback = submitCallback;
    this.preFill = preFill;

    debug('this', this);

  }
}

class Notifier {
  constructor() {
    this.dispatched = new Map();
    this.acknowledged = new Map();

    debug('this', this);
  }

  alert (...args) {

    debug('alert', ...args);

    let notification = new Notification_Alert(...args);

    let {style, message, duration } = notification;

    notie.alert(style, message, duration);

    this.dispatched.set(notification.id, notification);

    return true;
  }

  confirm (...args) {

    debug('confirm', ...args);
    
    let notification = new Notification_Confirm(...args);

    let { message, yesBtnText, noBtnText, yesCallback } = notification;
    notie.confirm(message, yesBtnText, noBtnText, yesCallback);

    this.dispatched.set(notification.id, notification);

    return true;

  } 

  input (...args) {

    debug('input', ...args);

    let notification = new Notification_Input(...args);
    
    let { message, submitBtnText, cancelBtnText, type, placeholder, submitCallback, preFill } = notification;
    notie.input(message, submitBtnText, cancelBtnText, type, placeholder, submitCallback, preFill);

    this.dispatched.set(notification.id, notification);

    return true;
      
  }

  acknowledge (id) {

    debug('acknowledge', id);

    let notification = this.dispatched.get(id);

    if (!notification) return false;

    notification = notification.acknowledge();

    this.acknowledged.set(id, notification);
    this.dispatched.delete(id);

  }

  status (id) {

    debug('status', id);

    let notificationStatus = null;

    for (let status of ['waiting', 'dispatched', 'acknowledged']) {
      if (this[status].has(id)) {
        notificationStatus = status;
        break;
      }
    }

    return notificationStatus;

  }

  static get types () {
    return {
      ALERT,
      CONFIRM,
      INPUT
    }
  }

  static get Notification () {
    return Notification;
  }

  static get Alert () {
    return Notification_Alert;
  }

  static get Confirm () {
    return Notification_Confirm;
  }

  static get Input  () {
    return Notification_Input;
  }

}

module.exports = Notifier;
