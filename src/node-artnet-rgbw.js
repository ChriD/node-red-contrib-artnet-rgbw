//@ts-check

module.exports = function(RED) {
    "use strict";
    var fs = require("fs");
    var path = require("path");
    var defaultPath = path.join(RED.settings.userDir, "artnetRGBW") + "\\";

    function NodeArtnetRGBW(_config) {
        RED.nodes.createNode(this, _config);

        // TODO: only change color on bus when lamp is on?! 
        // TODO: store things extern? do not store the default color?
       
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


    RED.nodes.registerType("node-artnet-rgbw",NodeArtnetRGBW);
}