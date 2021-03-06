import {noView} from 'aurelia-framework';
import {EventAggregator} from 'aurelia-event-aggregator';
import {IMAGE_CONFIG_SELECT} from '../events/events';
import ImageConfig from '../model/image_config';
import {REQUEST_PARAMS} from '../utils/constants'

/**
 * Provides all the information to the application that it shares
 * among its components, in particular it holds ImageConfig instances
 * which represent the data object/model.
 *
 * The individual ImageConfig instances are not 1:1 related to an image so that
 * a kind of multiple document interface is possible, or said differently:
 * the same image can be opened/viewer/interacted with multiple times and
 * potentially independently.
 *
 * The flag that defines if nore than one image can be opened/viewed/interacted with
 * is useMDI.
 */
@noView
export default class Context {
    /**
     * the aurelia event aggregator
     * @type {EventAggregator}
     */
    eventbus = null;

    /**
     * server information (if not localhost)
     * @type {string}
     */
    server = null;

    /**
     * a map for a more convenient key based lookup of an ImageConfig instance
     * @type {Map}
     */
    image_configs = new Map();

    /**
     * the key of the presently selected/active ImageConfig
     * this setting gains only importance if useMDI is set to true
     * so that multiple images can be open but only one is active/interacted with
     * @type {number}
     */
    selected_config = null;

    /**
     * Are we allowed to open/view/interact with more than one image
     * @type {boolean}
     */
    useMDI = false;

    /**
     * the global flag for showing regions
     * @type {boolean}
     */
    show_regions = false;

    /**
     * the global flag for showing the scalebar
     * @type {boolean}
     */
     show_scalebar = false;

     /**
      * application wide keyhandlers.
      * see addKeyListener/removeKeyListener
      * entries in the map are of the following format
      * e.g.: key: 65, value: {func: this.selectAllShapes, args: [true]}
      *
      * @memberof Context
      * @type {Map}
      */
     key_listeners = new Map();

    /**
     * @constructor
     * @param {EventAggregator} eventbus the aurelia event aggregator
     * @param {number} initial_image_id the initial image id
     * @param {object} optParams an object containing optional req params
     */
    constructor(eventbus = null, initial_image_id=null, optParams={}) {
        // event aggregator is mandatory
        if (typeof eventbus instanceof EventAggregator)
            throw "Invalid EventAggregator given!"

        let server = optParams[REQUEST_PARAMS.SERVER];
        if (typeof server !== 'string' || server.length === 0) server = "";
        else {
            // check for localhost and if we need to prefix for requests
            let isLocal =
                server.indexOf("localhost") >=0 ||
                server.indexOf("127.0.0.1") >=0 ;
            let minLen = "http://".length;
            let pos =
                server.indexOf("localhost") >= minLen ?
                    server.indexOf("localhost") : server.indexOf("127.0.0.1");
            if (isLocal && pos < minLen)  // we need to add the http
                server = "http://" + server;
        }
        delete optParams[REQUEST_PARAMS.SERVER];
        this.eventbus = eventbus;
        this.server = server;
        this.initParams = optParams;

        // we set the initial image as the default (if given)
        let initial_image_config = this.addImageConfig(initial_image_id);
        this.selected_config = initial_image_config.id;
        // set up key listener
        this.establishKeyDownListener();
    }

    /**
     * Creates an app wide key down listener
     * that will listen for key presses registered via addKeyListener
     *
     * @memberof Context
     */
    establishKeyDownListener() {
        // we do this only once
        if (window.onkeydown === null)
            window.onkeydown = (event) => {
                try {
                    // only process CTRL+KEY combinations
                    // and if target is an input field,
                    // we do not wish to override either
                    if (!event.ctrlKey ||
                            event.target.tagName.toUpperCase() === 'INPUT')
                            return;
                    let keyHandler =
                        this.key_listeners.get(event.keyCode);
                    if (keyHandler) {
                        // prevents IE standard key handler
                        event.preventDefault();
                        keyHandler(event);
                        // important: prevents browser specific handlers
                        return false;
                    }
                } catch(whatever) {}
            };
    }

    /**
     * Registers an app wide key handler for individual keys for onkeydown
     *
     * @memberof Context
     * @param {number} key the numeric key code to listen for
     * @param {function} action a function
     */
    addKeyListener(key, action) {
        // some basic checks as to validity of key and key_handler_def
        // we need a numeric key and a function at a minimum
        if (typeof key !== 'number' || typeof action !== 'function') return;

        this.key_listeners.set(key, action);
    }

    /**
     * Unregisters a keydown handler for a particular key
     *
     * @param {number} key the key code associated with the listener
     * @memberof Context
     */
    removeKeyListener(key) {
        if (typeof key !== 'number') return;
        this.key_listeners.delete(key);
    }

    /**
     * Creates and adds an ImageConfig instance by handing it an id of an image
     * stored on the server, as well as making it the selected/active image config.
     *
     * The returned ImageConfig object will have an id set on it by which it
     * can be uniquely identified and retrieved which makes it possible for
     * the same image to be used in multiple ImageConfigs.
     *
     * @memberof Context
     * @param {number} image_id the image id of the server
     * @return {ImageConfig} an ImageConfig object
     */
    addImageConfig(image_id) {
        if (typeof image_id !== 'number' || image_id < 0)
            return null;

        // we do not keep the other configs around unless we are in MDI mode.
        if (!this.useMDI)
            for (let [id, conf] of this.image_configs)
                this.removeImageConfig(id,conf)

        let image_config = new ImageConfig(this, image_id);
        // store the image config in the map and make it the selected one
        this.image_configs.set(image_config.id, image_config);
        this.selectConfig(image_config.id);
        image_config.bind();

        return image_config;
    }

    /**
     * Removes an image config from the internal map.
     * We can hand it either the id or a reference to itself
     *
     * @memberof Context
     * @param {ImageConfig|number} image_config_or_id id or ImageConfig
     */
    removeImageConfig(image_config_or_id) {
        let conf = null;
        if (image_config_or_id instanceof ImageConfig)
            conf = image_config_or_id;
        else if (typeof image_config_or_id === "number")
            conf = this.image_configs.get(image_config_or_id);

        // neither reference nor valid id
        if (!(conf instanceof ImageConfig)) return;

        // take out of map
        this.image_configs.delete(conf.id);

        // deselect if we were selected
        let selId = this.getSelectedImageConfig();
        if (selId && selId === conf.id)
            this.selected_config = null;

        // call unbind and wipe reference
        conf.unbind();
        conf = null;
    }

    /**
     * Selects an image config and sends out an event notification
     * This method is really only relevant for MDI mode
     *
     * @memberof Context
     * @param {number} id the ImageConfig id
     */
    selectConfig(id=null) {
        if (typeof id !== 'number' || id < 0 ||
            !(this.image_configs.get(id) instanceof ImageConfig))
            return null;

        this.selected_config = id;

        if (this.useMDI)
            this.publish(
                IMAGE_CONFIG_SELECT, { image_config: this.selected_config});
    }

    /**
     * Retrieves an image config given an id. This method will look up existing
     * ImageConfigs in the map and, therefore, not reissue a backend request,
     * unless explicitly told so.
     *
     * @memberof Context
     * @param {number} id the ImageConfig id
     * @param {boolean} forceRequest if true an ajax request is forced to update the data
     * @return {ImageConfig} the image config object or null
     */
    getImageConfig(id, forceRequest=false) {
        if (typeof id !== 'number' || id < 0)
            return null;

        // check if we exit
        let image_config = this.image_configs.get(id);
        if (!(image_config instanceof ImageConfig) || image_config === null)
            return null;

        // we are told to request the data from the backend
        if (image_config && forceRequest) image_config.image_info.requestData();

        return image_config;
    }

    /**
     * Returns the active ImageConfig.
     * Unless we operate in MDI mode calling this method is superfluous.
     *
     * @memberof Context
     * @return {ImageConfig|null} returns an ImageConfig or null
     */
    getSelectedImageConfig() {
        if (typeof this.selected_config !== 'number') return null;

        return this.getImageConfig(this.selected_config);
    }

    /**
     * Convenience or short hand way of publishing via the internal eventbus.
     * It will just delegate whatever you hand it as arguments
     *
     * @memberof Context
     */
    publish() {
        this.eventbus.publish.apply(this.eventbus, arguments);
    }

    /**
     * Retrieves initial request parameter by key
     *
     * @param {string} key the key
     * @return {string|null} returns the value associated with the key or null
     * @memberof Context
     */
    getInitialRequestParam(key) {
        if (typeof key !== 'string' ||
            typeof this.initParams !== 'object') return null;

        key = key.toUpperCase();
        if (typeof this.initParams[key] === 'undefined' ||
            typeof this.initParams[key] === null) return null;

        return this.initParams[key];
    }
}
