
module.exports = function(RED) {
    "use strict";
    var fs = require("fs");
    var path = require("path");

    class NodeArtnetRGBW
    {
        constructor(_config){
            RED.nodes.createNode(this, _config);
            var self = this;
            this.config = _config;

            // a marker to know if the lamp/stripe is on or off. it will be used to be sure that
            // color settings won't be mase if the lamp is on.
            this.isOn = false;

            // this settings are to set a gui data delay. The node's second output returns values
            // for updating gui and if you want to update the gui a little later or if there are problems
            // when updating the gui to inteferences then we may try to set a gui delay [MS]
            this.guiDelay = 0;
            this.guiTimeoutId = 0;

            // get a default path for storing any type of settings within the node itself
            this.defaultPath = path.join(RED.settings.userDir, "artnetRGBW") + "\\";

            // when node is created try to load the default color
            this.loadDefaultColor();

            // attach the "on" event
            this.on('input', function(_msg) { self.input(_msg) });
        }


         /**
         * with this method we can create a directory, it will return true if directory was
         * created or is already existent
         * @param {String} the directory which should be created
         * @return {Boolean} true if directory was created or already exists
         */
        createDirectory(_dir)
        {
            try
            {
                fs.mkdirSync(_dir)
            }
            catch (_err)
            {
                if (_err.code !== 'EEXIST')
                {
                    this.error(_err.toString());
                    return false;
                }
            }
            return true;
        }


        /**
         * used to store a JSON object to a file
         * @param {String} the filename without the directory (default Path will be used)
         * @param {Object} the object to save (has to be stringifyable)
         * @return {Boolean} true if file was saved, otherwise false
         */
        saveDataToFile(_filename, _data)
        {
            try
            {
                if(this.createDirectory(this.defaultPath))
                {
                    fs.writeFileSync(this.defaultPath + _filename, JSON.stringify(_data))
                    return true
                }
            }
            catch(_err)
            {
                this.error(_err.toString())
            }
            return false
        }


        /**
         * used to load a json object to a file file into a JSON object
         * @param {String} the filename without the directory (default Path will be used)
         * @return {Object} the object if found, otherwise returns null
         */
        loadDataFromFile(_filename)
        {
            try
            {
                var data = fs.readFileSync(this.defaultPath + _filename)
                return JSON.parse(data)
            }
            catch (err)
            {
                this.error(err.toString())
                return null
            }
        }


        /**
         * deep-copy a object
         * @param {Object} the object to copy
         * @return {Object} a copy of the object
         */
        copyObject(_object)
        {
            return JSON.parse(JSON.stringify(_object))
        }


        /**
         * create a message object for sending to outputs
         * @return {Object} a message object
         */
        createMessageObject()
        {
            return new Object()
        }


        /**
         * changes the color on the related ArtnetNode to the desired one
         * @param {Object} the desired color (an object wich contains rgbw values)
         * @param {String} identifier for a transition (currently only one is existend which is "linear")
         * @param {Integer} the duration of the transition in milisecons
         */
        changeToColor(_color, _transition, _duration)
        {
            // create a payload with the rgbw color (channels) and send it to the next node (which should be the artnet node)
            var msg     = this.createMessageObject();
            msg.payload = this.createPayload(parseInt(this.config.address), _color.red, _color.green, _color.blue, _color.white, _transition, _duration);
            this.send([msg, null]);
            // be sure the node knows about its current color (in fact its the "end" color because duration may happen)
            this.currentColor = this.copyObject(_color);
        }


        /**
         * creates a payload for an artnet node
         * @param {integer} address of the node (starting address of firts channel)
         * @param {integer} red 0..255
         * @param {integer} green 0..255
         * @param {integer} blue 0..255
         * @param {integer} white 0..255
         * @return {Object} payload for an artnet node
         */
        createPayload (_address, _r, _g, _b, _w, _transition = "", _duration = 0)
        {
            var payload;
            payload =  {
                buckets: [
                    {channel: _address,     value: _r},
                    {channel: _address+1,   value: _g},
                    {channel: _address+2,   value: _b},
                    {channel: _address+3,   value: _w}
                ]
            };

            if(_duration)
            {
                payload.transition  = _transition;
                payload.duration    =  _duration;
            }

            return payload;
        }


        sendGUIOutput(_delay)
        {
            var node = this;
            if (this.guiDelay == 0)
            {
                var msg = this.createMessageObject();
                msg.payload = this.copyObject(this.currentColor);
                this.send([null, msg]);
            }
            else
            {
                if(this.guiTimeoutId){
                    clearTimeout(this.guiTimeoutId);
                }
                this.guiTimeoutId = setTimeout(function(){
                    var msg = node.createMessageObject();
                    msg.payload = node.copyObject(node.currentColor);
                    msg.isGUIUpdate = true;
                    node.send([null, msg]);
                    node.guiTimeoutId = 0;
                }, _delay)
            }
        }


        /**
         * returns the color object for "OFF"
         * @return {Object} color object
         */
        getOffColor()
        {
            return {
                red: 0,
                green: 0,
                blue: 0,
                white: 0
            };
        }


        hexToColorObject(_hexValue){
            var color = new Object();
            try
            {
                color.red   = parseInt(_hexValue.substr(1, 2), 16);
                color.green = parseInt(_hexValue.substr(3, 2), 16);
                color.blue  = parseInt(_hexValue.substr(5, 2), 16);
                color.white = parseInt(_hexValue.substr(7, 2), 16);
            }
            catch(_e)
            {
                this.error("Error converting HEX to color object: " + _e.toString());
                this.defaultColorObject(color);
            }
            return color;
        }


        colorObjectToHex(_color){
            return "#" + _color.red.toString(16).padStart(2,0) + _color.green.toString(16).padStart(2,0) + _color.blue.toString(16).padStart(2,0) + _color.white.toString(16).padStart(2,0);
        }


        defaultColorObject(_color){
            if(!_color.red)      _color.red = 0;
            if(!_color.green)    _color.green = 0;
            if(!_color.blue)     _color.blue = 0;
            if(!_color.white)    _color.white = 0;
        }



        saveDefaultColor(_color){
            //node.config.defaultColorHex = node.colorObjectToHex(_color);
            var msg = this.createMessageObject();
            msg.payload = _color;
            //node.send([null, null, msg]);
            // TODO: save back to the node configuration!!!
            this.saveDataToFile(this.config.name, _color);
            this.defaultColor = this.copyObject(_color);
        }


        loadDefaultColor(){
            this.defaultColor = this.loadDataFromFile(this.config.name);
            console.log("[node-artnet-rgbw] Default color: " + JSON.stringify(this.defaultColor));
        }


        updateColorObject(_colorObject, _colorId, _colorValue)
        {
            switch(_colorId.toUpperCase())
            {
                case "RED":
                    _colorObject.red = _colorValue;
                    break;
                case "GREEN":
                    _colorObject.green = _colorValue;
                    break;
                case "BLUE":
                    _colorObject.blue = _colorValue;
                    break;
                case "WHITE":
                    _colorObject.white = _colorValue;
                    break;
            }
            // be sure we do have all values in the object!
            this.defaultColorObject(_colorObject);
        }


        input(_msg) {

            var node = this;

            console.log("[node-artnet-rgbw] VS-Code Debug entry point");

            // skip any stuff it messages comes from a gui update where we do not want to update the colors
            // (becaus the settings was sent by this node!)
            if(_msg.isGUIUpdate && _msg.isGUIUpdate == true)
                return;

            try
            {
                if(!this.defaultColor)
                this.defaultColor = node.getOffColor();


                // be sure we have the current color loaded
                if(!this.currentColor)
                this.currentColor = this.getOffColor();

                // create a temporary color object which will hold the current color on input!
                this.currentColorStart = this.copyObject(this.currentColor)

                // if the payload is a stringt we assume it's a command!
                if(typeof _msg.payload === "string")
                {
                    _msg.payload = { action : _msg.payload }
                }

                // if the payload is a number we assume its a color value command!
                // we will know the color by checking the 'topic' on the message (node-red-dashboard sliders)
                if(typeof _msg.payload === "number" && _msg.topic)
                {
                    _msg.payload = { action : "SETSINGLECOLOR", colorValue : _msg.payload, colorId : _msg.topic, checkOn : true}
                }

                // be sure we do have all values defined in the object. If some are not defined they will be set to 0
                if(_msg.payload.color)
                this.defaultColorObject(_msg.payload.color);

                // use some vales from the config if they are not specified in the payload
                if(!_msg.payload.softChange)
                    _msg.payload.softChange = this.config.softOnOff;
                if(!_msg.payload.softChangeDuration)
                    _msg.payload.softChangeDuration = this.config.softOnOffDuration;

                if(_msg.payload.softChangeDuration && typeof _msg.payload.softChangeDuration === "string")
                    _msg.payload.softChangeDuration =  parseInt(_msg.payload.softChangeDuration);

                // lets see if we do have an action like fading or soft on/soft off
                if(_msg.payload.action)
                {
                    switch(_msg.payload.action.toUpperCase())
                    {
                        case "ON":

                            // if there is no color specified we load the payload color object with the default value
                            // on fact this  is only neded for "ON" action
                            console.log("[node-artnet-rgbw] Default color 1: " + JSON.stringify(this.defaultColor));
                            if(!_msg.payload.color)
                                //_msg.payload.color = this.hexToColorObject(this.config.defaultColorHex);
                                _msg.payload.color = this.copyObject(this.defaultColor)
                            console.log("[node-artnet-rgbw] On color: " + JSON.stringify(_msg.payload.color));
                            this.isOn = true;
                            this.changeToColor(_msg.payload.color, _msg.payload.transition ? _msg.payload.transition : "linear", _msg.payload.softChange ? _msg.payload.softChangeDuration : 0);

                            break;
                        case "OFF":
                            this.isOn = false;
                            this.changeToColor(this.getOffColor(), _msg.payload.transition ? _msg.payload.transition : "linear", _msg.payload.softChange ? _msg.payload.softChangeDuration : 0);
                            break;
                        case "SETCOLOR":
                            //if(!node.guiResponseTimeoutId)
                            this.changeToColor(_msg.payload.color, _msg.payload.transition ? _msg.payload.transition : "linear", _msg.payload.softChange ? _msg.payload.softChangeDuration : 0);
                            break;
                        case "SETSINGLECOLOR":
                            //if(!node.guiResponseTimeoutId)
                            {
                                this.updateColorObject(this.currentColor, _msg.payload.colorId, _msg.payload.colorValue);
                                if(!_msg.payload.checkOn || (_msg.payload.checkOn && this.isOn))
                                    this.changeToColor(this.currentColor, _msg.payload.transition ? _msg.payload.transition : "linear", _msg.payload.softChange ? _msg.payload.softChangeDuration : 0);
                            }
                            break;
                        // save the current color value as default value for next "ON" action
                        case "SAVEDEFAULT":
                            this.saveDefaultColor(this.currentColor);
                            break;
                    }
                }

                this.sendGUIOutput((_msg.payload.softChangeDuration + this.guiDelay));
            }
            catch(_e)
            {
                node.error(_e.toString());
            }
        }


    }

        /*
    function NodeArtnetRGBW(_config) {
        RED.nodes.createNode(this, _config);

        // global node object for this context
        var node = this;

        node.config = _config;
        node.isOn = false;
        node.transitionColor = {};
        node.guiDelay = 0;
        node.guiTimeoutId = 0;


        this.saveDataToFile = function(_filename, _data) {
            try {
                fs.mkdirSync(defaultPath)
            } catch (err) {
                if (err.code !== 'EEXIST')
                {
                    node.error(err.toString());
                    throw err
                }
            }
            fs.writeFileSync(defaultPath + _filename, JSON.stringify(_data));
        }

        this.loadDataFromFile = function(_filename) {
            try {
                var data = fs.readFileSync(defaultPath + _filename);
                return JSON.parse(data);
            } catch (err) {
                node.error(err.toString());
                return null;
            }
        }


        this.copyObject = function(_object){
            return JSON.parse(JSON.stringify(_object));
        }


        this.createMessageObject = function(){
            return new Object();
        }


        this.changeToColor = function(_color, _transition, _duration){
            var msg     = node.createMessageObject();
            // TODO: create own fading because the undrlaying lib does not do very well in my opinition!
            //if(_duration)
            //{
            //    node.softChangeToColor(_color, _transition, _duration);
            //}
            //else
            {
                msg.payload = node.createPayload(parseInt(node.config.address), _color.red, _color.green, _color.blue, _color.white, _transition, _duration);
                node.send([msg, null]);
                node.currentColor = node.copyObject(_color);
            }
        }


        this.createPayload = function(_address, _r, _g, _b, _w, _transition = "", _duration = 0){
            var payload;
            payload =  {
                buckets: [
                    {channel: _address,     value: _r},
                    {channel: _address+1,   value: _g},
                    {channel: _address+2,   value: _b},
                    {channel: _address+3,   value: _w}
                ]
            };

            if(_duration)
            {
                payload.transition  = _transition;
                payload.duration    =  _duration;
            }

            return payload;
        }


        this.sendGUIOutput = function(_delay)
        {
            if (node.guiDelay == 0)
            {
                var msg = node.createMessageObject();
                msg.payload = node.copyObject(node.currentColor);
                node.send([null, msg]);
            }
            else
            {
                if(node.guiTimeoutId){
                    clearTimeout(node.guiTimeoutId);
                }
                node.guiTimeoutId = setTimeout(function(){
                    var msg = node.createMessageObject();
                    msg.payload = node.copyObject(node.currentColor);
                    msg.isGUIUpdate = true;
                    node.send([null, msg]);
                    node.guiTimeoutId = 0;
                }, _delay)
            }
        }


        this.getOffColor = function(){
            return {
                red: 0,
                green: 0,
                blue: 0,
                white: 0
            };
        }


        this.hexToColorObject = function(_hexValue){
            var color = new Object();
            try
            {
                color.red   = parseInt(_hexValue.substr(1, 2), 16);
                color.green = parseInt(_hexValue.substr(3, 2), 16);
                color.blue  = parseInt(_hexValue.substr(5, 2), 16);
                color.white = parseInt(_hexValue.substr(7, 2), 16);
            }
            catch(_e)
            {
                node.error("Error converting HEX to color object: " + _e.toString());
                node.defaultColorObject(color);
            }
            return color;
        }


        this.colorObjectToHex = function(_color){
            return "#" + _color.red.toString(16).padStart(2,0) + _color.green.toString(16).padStart(2,0) + _color.blue.toString(16).padStart(2,0) + _color.white.toString(16).padStart(2,0);
        }


        this.defaultColorObject = function(_color){
            if(!_color.red)      _color.red = 0;
            if(!_color.green)    _color.green = 0;
            if(!_color.blue)     _color.blue = 0;
            if(!_color.white)    _color.white = 0;
        }



        this.saveDefaultColor = function(_color){
            //node.config.defaultColorHex = node.colorObjectToHex(_color);
            var msg = node.createMessageObject();
            msg.payload = _color;
            //node.send([null, null, msg]);
            // TODO: save back to the node configuration!!!
            node.saveDataToFile(node.config.name, _color);
            node.defaultColor = node.copyObject(_color);
        }


        this.loadDefaultColor = function(){
            node.defaultColor = node.loadDataFromFile(node.config.name);
            console.log("[node-artnet-rgbw] Default color: " + JSON.stringify(node.defaultColor));
        }


        this.updateColorObject = function(_colorObject, _colorId, _colorValue)
        {
            switch(_colorId.toUpperCase())
            {
                case "RED":
                    _colorObject.red = _colorValue;
                    break;
                case "GREEN":
                    _colorObject.green = _colorValue;
                    break;
                case "BLUE":
                    _colorObject.blue = _colorValue;
                    break;
                case "WHITE":
                    _colorObject.white = _colorValue;
                    break;
            }
            // be sure we do have all values in the object!
            node.defaultColorObject(_colorObject);
        }


        node.on('input', function(_msg) {

            console.log("[node-artnet-rgbw] VS-Code Debug entry point");

            // skip any stuff it messages comes from a gui update which we did
            if(_msg.isGUIUpdate && _msg.isGUIUpdate == true)
            {
                console.log("Skipping because of gui update!")
                return;
            }

            // TODO: UIupdate --> Kenner erstellen der mir sagt das es ein UI update ist, dann tun wir nämlich hier garnix!

            try
            {

                //if(!node.defaultColor)
                //    node.defaultColor = node.loadDefaultColor();
                if(!node.defaultColor)
                    node.defaultColor = node.getOffColor();


                // be sure we have the current color loaded
                if(!node.currentColor)
                    node.currentColor = node.getOffColor();

                // create a temporary color object which will hold the current color on input!
                node.currentColorStart = node.copyObject(node.currentColor)

                // if the payload is a stringt we assume it's a command!
                if(typeof _msg.payload === "string")
                {
                    _msg.payload = { action : _msg.payload }
                }

                // if the payload is a number we assume its a color value command!
                // we will know the color by checking the 'topic' on the message (node-red-dashboard sliders)
                if(typeof _msg.payload === "number" && _msg.topic)
                {
                    _msg.payload = { action : "SETSINGLECOLOR", colorValue : _msg.payload, colorId : _msg.topic, checkOn : true}
                }

                // be sure we do have all values defined in the object. If some are not defined they will be set to 0
                if(_msg.payload.color)
                    node.defaultColorObject(_msg.payload.color);

                // use some vales from the config if they are not specified in the payload
                if(!_msg.payload.softChange)
                    _msg.payload.softChange = node.config.softOnOff;
                if(!_msg.payload.softChangeDuration)
                    _msg.payload.softChangeDuration = node.config.softOnOffDuration;

                if(_msg.payload.softChangeDuration && typeof _msg.payload.softChangeDuration === "string")
                    _msg.payload.softChangeDuration =  parseInt(_msg.payload.softChangeDuration);

                // lets see if we do have an action like fading or soft on/soft off
                if(_msg.payload.action)
                {
                    switch(_msg.payload.action.toUpperCase())
                    {
                        case "ON":

                            // if there is no color specified we load the payload color object with the default value
                            // on fact this  is only neded for "ON" action
                            console.log("[node-artnet-rgbw] Default color 1: " + JSON.stringify(node.defaultColor));
                            if(!_msg.payload.color)
                                //_msg.payload.color = node.hexToColorObject(node.config.defaultColorHex);
                                _msg.payload.color = node.copyObject(node.defaultColor)
                            console.log("[node-artnet-rgbw] On color: " + JSON.stringify(_msg.payload.color));
                            node.isOn = true;
                            node.changeToColor(_msg.payload.color, _msg.payload.transition ? _msg.payload.transition : "linear", _msg.payload.softChange ? _msg.payload.softChangeDuration : 0);
                            // well, we did update...
                            //var msgRGBOutput = node.createMessageObject();
                            //msgRGBOutput.payload = node.copyObject(_msg.payload.color);
                            //node.send([null, msgRGBOutput, null])

                            break;
                        case "OFF":
                            node.isOn = false;
                            node.changeToColor(node.getOffColor(), _msg.payload.transition ? _msg.payload.transition : "linear", _msg.payload.softChange ? _msg.payload.softChangeDuration : 0);
                            break;
                        case "SETCOLOR":
                            //if(!node.guiResponseTimeoutId)
                                node.changeToColor(_msg.payload.color, _msg.payload.transition ? _msg.payload.transition : "linear", _msg.payload.softChange ? _msg.payload.softChangeDuration : 0);
                            break;
                        case "SETSINGLECOLOR":
                            //if(!node.guiResponseTimeoutId)
                            {
                                node.updateColorObject(node.currentColor, _msg.payload.colorId, _msg.payload.colorValue);
                                if(!_msg.payload.checkOn || (_msg.payload.checkOn && node.isOn))
                                    node.changeToColor(node.currentColor, _msg.payload.transition ? _msg.payload.transition : "linear", _msg.payload.softChange ? _msg.payload.softChangeDuration : 0);
                            }
                            break;
                        // save the current color value as default value for next "ON" action
                        case "SAVEDEFAULT":
                            node.saveDefaultColor(node.currentColor);
                            break;
                    }
                }

                node.sendGUIOutput((_msg.payload.softChangeDuration + node.guiDelay));
            }
            catch(_e)
            {
                node.error(_e.toString());
            }
        });


        node.loadDefaultColor();
    }
    */


    RED.nodes.registerType("node-artnet-rgbw", NodeArtnetRGBW);
}