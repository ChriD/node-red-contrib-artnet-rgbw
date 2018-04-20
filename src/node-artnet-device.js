
module.exports = function(RED) {
    "use strict";
    var fs = require("fs");
    var path = require("path");

    class NodeArtnetDevice
    {
        constructor(_config){
            RED.nodes.createNode(this, _config);
            var self = this;
            this.config = _config;
            this.msg = null;

            this.state  = new Object();
            this.defaultState = new Object();

            // a marker to know if the lamp/stripe is on or off. it will be used to be sure that
            // color settings wont be mase if the lamp is on.
            this.isOn = false;

            // get a default path for storing any type of settings within the node itself
            this.defaultPath = path.join(RED.settings.userDir, "artnetDevice") + "\\";

            // when node is created try to load the default color
            this.loadDefaultState();

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


        /*
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
        */


        defaultColorObject(_color){
            if(!_color.red)      _color.red = 0;
            if(!_color.green)    _color.green = 0;
            if(!_color.blue)     _color.blue = 0;
            if(!_color.white)    _color.white = 0;
        }



        getNodeIdentifier()
        {
            return this.config.name + "_" + this.id;
        }


        saveDefaultState(_state){
            this.saveDataToFile(this.getNodeIdentifier() + "_default", _state);
            this.defaultState = this.copyObject(_state);
        }

        saveState(_state){
            this.saveDataToFile(this.getNodeIdentifier(), _state);
            this.state = this.copyObject(_state);
        }

        loadDefaultState(){
            this.defaultState = this.loadDataFromFile(this.getNodeIdentifier() + "_default");
            console.log("[node-artnet-device] Default state: " + JSON.stringify(this.defaultState));
        }

        loadState(){
            this.state = this.loadDataFromFile(this.getNodeIdentifier());
            console.log("[node-artnet-device] Default state: " + JSON.stringify(this.state));
        }



        createArtnetOutput (_address, _values, _transition = "", _duration = 0)
        {
            var payload = new Object();
            payload.buckets = new Array();

            _address = parseInt(_address);

            for(var i=0; i<_values.length; i++)
            {
                payload.buckets.push( {channel: (_address + i), value: _values[i] } );
            }

            if(_duration)
            {
                payload.transition  = _transition;
                payload.duration    =  _duration;
            }
            return { "payload" : payload };
        }


        updateMessageFromConfig(_msg)
        {
            // use some vales from the config of the node if they are not specified in the payload
            if(!_msg.payload.softChange)
                _msg.payload.softChange = this.config.softOnOff;
            if(!_msg.payload.softChangeDuration)
                _msg.payload.softChangeDuration = this.config.softOnOffDuration;
            if(_msg.payload.softChangeDuration && typeof _msg.payload.softChangeDuration === "string")
                _msg.payload.softChangeDuration =  parseInt(_msg.payload.softChangeDuration);
        }


        input_Single(_msg)
        {
            // if only a number is given we assume its a value to set the light value of the lamp
            if(typeof _msg.payload === "number")
            {
                _msg.payload = { value : _msg.payload }
                _msg.payload.action = "SETVALUE"
            }
            // if only a string is given we assume its a action command
            else if(typeof _msg.payload === "string")
            {
                _msg.payload = { action : _msg.payload }
            }

            this.updateMessageFromConfig(_msg);

            // we always have to have an action for the input
            if(_msg.payload.action)
            {
                switch(_msg.payload.action.toUpperCase())
                {
                    case "ON":
                        this.isOn = true;
                        this.state = this.copyObject(this.defaultState);
                        var output = this.createArtnetPayload(this.config.address, [this.state.value], "linear", _msg.payload.softChangeDuration);
                        this.send(output, this.state);
                        break;
                    case "OFF":
                        this.isOn = false;
                        this.state.value = 0
                        var output = this.createArtnetPayload(this.config.address, [this.state.value], "linear", _msg.payload.softChangeDuration);
                        this.send(output, this.state);
                        break;
                    case "SETVALUE":
                        this.state.value = _msg.value;
                        var output = this.createArtnetPayload(this.config.address, [this.state.value], "linear", _msg.payload.softChangeDuration);
                        this.send(output, this.state);
                        break;
                    case "SAVEDEFAULT":
                        this.saveDefaultState(this.state);
                        break;
                }
            }
        }


        input_RGB(_msg)
        {
            this.input_RGBW(_msg, false)
        }


        input_RGBW(_msg, _useWhite = true)
        {
             // if only a number is given we assume its a value to set the light value of the lamp
             if(typeof _msg.payload === "string")
             {
                 _msg.payload = { action : _msg.payload }
             }
             else
             {
                _msg.payload.action = "SETVALUE"
             }

            this.updateMessageFromConfig(_msg);

            // we always have to have an action for the input
            if(_msg.payload.action)
            {
                switch(_msg.payload.action.toUpperCase())
                {
                    case "ON":
                        this.isOn = true;
                        this.state = this.copyObject(this.defaultState);
                        if(_useWhite)
                            var output = this.createArtnetOutput(this.config.address, [this.state.color.red, this.state.color.green, this.state.color.blue, this.state.color.white], "linear", _msg.payload.softChangeDuration);
                        else
                            var output = this.createArtnetOutput(this.config.address, [this.state.color.red, this.state.color.green, this.state.color.blue], "linear", _msg.payload.softChangeDuration);
                        this.send([output,  { payload : this.state }]);
                        break;
                    case "OFF":
                        this.isOn = false;
                        this.state.color = this.getOffColor()
                        if(_useWhite)
                            var output = this.createArtnetOutput(this.config.address, [this.state.color.red, this.state.color.green, this.state.color.blue, this.state.color.white], "linear", _msg.payload.softChangeDuration);
                        else
                            var output = this.createArtnetOutput(this.config.address, [this.state.color.red, this.state.color.green, this.state.color.blue], "linear", _msg.payload.softChangeDuration);
                        this.send([output,  { payload : this.state }]);
                        break;
                    case "SETVALUE":
                        this.state.color = this.copyObject(_msg.payload.color)
                        this.defaultColorObject(this.state.color)
                        if(_useWhite)
                            var output = this.createArtnetOutput(this.config.address, [this.state.color.red, this.state.color.green, this.state.color.blue, this.state.color.white], "linear", _msg.payload.softChangeDuration);
                        else
                            var output = this.createArtnetOutput(this.config.address, [this.state.color.red, this.state.color.green, this.state.color.blue], "linear", _msg.payload.softChangeDuration);
                        this.send([output,  { payload : this.state }]);
                        break;
                    case "SAVEDEFAULT":
                        this.saveDefaultState(this.state);
                        // TODO: send confirmation to gui?
                        break;
                }
            }
        }


        input(_msg)
        {
            var node = this;
            this.msg = _msg;

            console.log("[node-artnet-device] VS-Code Debug entry point");

            if(!_msg)
                return;

            try
            {
                // we do have several types of artnet devices, switch code by type of device
                switch(parseInt(this.config.deviceType))
                {
                    // dimmable lamp or stripe with only one color and therfore one address
                    case 0:
                        this.input_Single(_msg);
                        break;
                    // dimmable RGB stripe or lamp
                    case 1:
                        this.input_RGB(_msg);
                        break;
                    // dimmable RGBW stripe or lamp
                    case 2:
                        this.input_RGBW(_msg);
                        break;
                }
            }
            catch(_e)
            {
                node.error(_e.toString());
            }
        }

    }

    RED.nodes.registerType("node-artnet-device", NodeArtnetDevice);
}