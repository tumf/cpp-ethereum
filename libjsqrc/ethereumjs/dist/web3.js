require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file coder.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var BigNumber = require('bignumber.js');
var utils = require('../utils/utils');
var f = require('./formatters');
var SolidityParam = require('./param');

/**
 * Should be used to check if a type is an array type
 *
 * @method isArrayType
 * @param {String} type
 * @return {Bool} true is the type is an array, otherwise false
 */
var isArrayType = function (type) {
    return type.slice(-2) === '[]';
};

/**
 * SolidityType prototype is used to encode/decode solidity params of certain type
 */
var SolidityType = function (config) {
    this._name = config.name;
    this._match = config.match;
    this._mode = config.mode;
    this._inputFormatter = config.inputFormatter;
    this._outputFormatter = config.outputFormatter;
};

/**
 * Should be used to determine if this SolidityType do match given type
 *
 * @method isType
 * @param {String} name
 * @return {Bool} true if type match this SolidityType, otherwise false
 */
SolidityType.prototype.isType = function (name) {
    if (this._match === 'strict') {
        return this._name === name || (name.indexOf(this._name) === 0 && name.slice(this._name.length) === '[]');
    } else if (this._match === 'prefix') {
        // TODO better type detection!
        return name.indexOf(this._name) === 0;
    }
};

/**
 * Should be used to transform plain param to SolidityParam object
 *
 * @method formatInput
 * @param {Object} param - plain object, or an array of objects
 * @param {Bool} arrayType - true if a param should be encoded as an array
 * @return {SolidityParam} encoded param wrapped in SolidityParam object 
 */
SolidityType.prototype.formatInput = function (param, arrayType) {
    if (utils.isArray(param) && arrayType) { // TODO: should fail if this two are not the same
        var self = this;
        return param.map(function (p) {
            return self._inputFormatter(p);
        }).reduce(function (acc, current) {
            return acc.combine(current);
        }, f.formatInputInt(param.length)).withOffset(32);
    } 
    return this._inputFormatter(param);
};

/**
 * Should be used to transoform SolidityParam to plain param
 *
 * @method formatOutput
 * @param {SolidityParam} byteArray
 * @param {Bool} arrayType - true if a param should be decoded as an array
 * @return {Object} plain decoded param
 */
SolidityType.prototype.formatOutput = function (param, arrayType) {
    if (arrayType) {
        // let's assume, that we solidity will never return long arrays :P 
        var result = [];
        var length = new BigNumber(param.dynamicPart().slice(0, 64), 16);
        for (var i = 0; i < length * 64; i += 64) {
            result.push(this._outputFormatter(new SolidityParam(param.dynamicPart().substr(i + 64, 64))));
        }
        return result;
    }
    return this._outputFormatter(param);
};

/**
 * Should be used to slice single param from bytes
 *
 * @method sliceParam
 * @param {String} bytes
 * @param {Number} index of param to slice
 * @param {String} type
 * @returns {SolidityParam} param
 */
SolidityType.prototype.sliceParam = function (bytes, index, type) {
    if (this._mode === 'bytes') {
        return SolidityParam.decodeBytes(bytes, index);
    } else if (isArrayType(type)) {
        return SolidityParam.decodeArray(bytes, index);
    }
    return SolidityParam.decodeParam(bytes, index);
};

/**
 * SolidityCoder prototype should be used to encode/decode solidity params of any type
 */
var SolidityCoder = function (types) {
    this._types = types;
};

/**
 * This method should be used to transform type to SolidityType
 *
 * @method _requireType
 * @param {String} type
 * @returns {SolidityType} 
 * @throws {Error} throws if no matching type is found
 */
SolidityCoder.prototype._requireType = function (type) {
    var solidityType = this._types.filter(function (t) {
        return t.isType(type);
    })[0];

    if (!solidityType) {
        throw Error('invalid solidity type!: ' + type);
    }

    return solidityType;
};

/**
 * Should be used to transform plain param of given type to SolidityParam
 *
 * @method _formatInput
 * @param {String} type of param
 * @param {Object} plain param
 * @return {SolidityParam}
 */
SolidityCoder.prototype._formatInput = function (type, param) {
    return this._requireType(type).formatInput(param, isArrayType(type));
};

/**
 * Should be used to encode plain param
 *
 * @method encodeParam
 * @param {String} type
 * @param {Object} plain param
 * @return {String} encoded plain param
 */
SolidityCoder.prototype.encodeParam = function (type, param) {
    return this._formatInput(type, param).encode();
};

/**
 * Should be used to encode list of params
 *
 * @method encodeParams
 * @param {Array} types
 * @param {Array} params
 * @return {String} encoded list of params
 */
SolidityCoder.prototype.encodeParams = function (types, params) {
    var self = this;
    var solidityParams = types.map(function (type, index) {
        return self._formatInput(type, params[index]);
    });

    return SolidityParam.encodeList(solidityParams);
};

/**
 * Should be used to decode bytes to plain param
 *
 * @method decodeParam
 * @param {String} type
 * @param {String} bytes
 * @return {Object} plain param
 */
SolidityCoder.prototype.decodeParam = function (type, bytes) {
    return this.decodeParams([type], bytes)[0];
};

/**
 * Should be used to decode list of params
 *
 * @method decodeParam
 * @param {Array} types
 * @param {String} bytes
 * @return {Array} array of plain params
 */
SolidityCoder.prototype.decodeParams = function (types, bytes) {
    var self = this;
    return types.map(function (type, index) {
        var solidityType = self._requireType(type);
        var p = solidityType.sliceParam(bytes, index, type);
        return solidityType.formatOutput(p, isArrayType(type));
    });
};

var coder = new SolidityCoder([
    new SolidityType({
        name: 'address',
        match: 'strict',
        mode: 'value',
        inputFormatter: f.formatInputInt,
        outputFormatter: f.formatOutputAddress
    }),
    new SolidityType({
        name: 'bool',
        match: 'strict',
        mode: 'value',
        inputFormatter: f.formatInputBool,
        outputFormatter: f.formatOutputBool
    }),
    new SolidityType({
        name: 'int',
        match: 'prefix',
        mode: 'value',
        inputFormatter: f.formatInputInt,
        outputFormatter: f.formatOutputInt,
    }),
    new SolidityType({
        name: 'uint',
        match: 'prefix',
        mode: 'value',
        inputFormatter: f.formatInputInt,
        outputFormatter: f.formatOutputUInt
    }),
    new SolidityType({
        name: 'bytes',
        match: 'strict',
        mode: 'bytes',
        inputFormatter: f.formatInputDynamicBytes,
        outputFormatter: f.formatOutputDynamicBytes
    }),
    new SolidityType({
        name: 'bytes',
        match: 'prefix',
        mode: 'value',
        inputFormatter: f.formatInputBytes,
        outputFormatter: f.formatOutputBytes
    }),
    new SolidityType({
        name: 'real',
        match: 'prefix',
        mode: 'value',
        inputFormatter: f.formatInputReal,
        outputFormatter: f.formatOutputReal
    }),
    new SolidityType({
        name: 'ureal',
        match: 'prefix',
        mode: 'value',
        inputFormatter: f.formatInputReal,
        outputFormatter: f.formatOutputUReal
    })
]);

module.exports = coder;


},{"../utils/utils":7,"./formatters":2,"./param":3,"bignumber.js":"bignumber.js"}],2:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file formatters.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var BigNumber = require('bignumber.js');
var utils = require('../utils/utils');
var c = require('../utils/config');
var SolidityParam = require('./param');


/**
 * Formats input value to byte representation of int
 * If value is negative, return it's two's complement
 * If the value is floating point, round it down
 *
 * @method formatInputInt
 * @param {String|Number|BigNumber} value that needs to be formatted
 * @returns {SolidityParam}
 */
var formatInputInt = function (value) {
    var padding = c.ETH_PADDING * 2;
    BigNumber.config(c.ETH_BIGNUMBER_ROUNDING_MODE);
    var result = utils.padLeft(utils.toTwosComplement(value).round().toString(16), padding);
    return new SolidityParam(result);
};

/**
 * Formats input value to byte representation of string
 *
 * @method formatInputBytes
 * @param {String}
 * @returns {SolidityParam}
 */
var formatInputBytes = function (value) {
    var result = utils.fromAscii(value, c.ETH_PADDING).substr(2);
    return new SolidityParam(result);
};

/**
 * Formats input value to byte representation of string
 *
 * @method formatInputDynamicBytes
 * @param {String}
 * @returns {SolidityParam}
 */
var formatInputDynamicBytes = function (value) {
    var result = utils.fromAscii(value, c.ETH_PADDING).substr(2);
    return new SolidityParam(formatInputInt(value.length).value + result, 32);
};

/**
 * Formats input value to byte representation of bool
 *
 * @method formatInputBool
 * @param {Boolean}
 * @returns {SolidityParam}
 */
var formatInputBool = function (value) {
    var result = '000000000000000000000000000000000000000000000000000000000000000' + (value ?  '1' : '0');
    return new SolidityParam(result);
};

/**
 * Formats input value to byte representation of real
 * Values are multiplied by 2^m and encoded as integers
 *
 * @method formatInputReal
 * @param {String|Number|BigNumber}
 * @returns {SolidityParam}
 */
var formatInputReal = function (value) {
    return formatInputInt(new BigNumber(value).times(new BigNumber(2).pow(128)));
};

/**
 * Check if input value is negative
 *
 * @method signedIsNegative
 * @param {String} value is hex format
 * @returns {Boolean} true if it is negative, otherwise false
 */
var signedIsNegative = function (value) {
    return (new BigNumber(value.substr(0, 1), 16).toString(2).substr(0, 1)) === '1';
};

/**
 * Formats right-aligned output bytes to int
 *
 * @method formatOutputInt
 * @param {SolidityParam} param
 * @returns {BigNumber} right-aligned output bytes formatted to big number
 */
var formatOutputInt = function (param) {
    var value = param.staticPart() || "0";

    // check if it's negative number
    // it it is, return two's complement
    if (signedIsNegative(value)) {
        return new BigNumber(value, 16).minus(new BigNumber('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 16)).minus(1);
    }
    return new BigNumber(value, 16);
};

/**
 * Formats right-aligned output bytes to uint
 *
 * @method formatOutputUInt
 * @param {SolidityParam}
 * @returns {BigNumeber} right-aligned output bytes formatted to uint
 */
var formatOutputUInt = function (param) {
    var value = param.staticPart() || "0";
    return new BigNumber(value, 16);
};

/**
 * Formats right-aligned output bytes to real
 *
 * @method formatOutputReal
 * @param {SolidityParam}
 * @returns {BigNumber} input bytes formatted to real
 */
var formatOutputReal = function (param) {
    return formatOutputInt(param).dividedBy(new BigNumber(2).pow(128)); 
};

/**
 * Formats right-aligned output bytes to ureal
 *
 * @method formatOutputUReal
 * @param {SolidityParam}
 * @returns {BigNumber} input bytes formatted to ureal
 */
var formatOutputUReal = function (param) {
    return formatOutputUInt(param).dividedBy(new BigNumber(2).pow(128)); 
};

/**
 * Should be used to format output bool
 *
 * @method formatOutputBool
 * @param {SolidityParam}
 * @returns {Boolean} right-aligned input bytes formatted to bool
 */
var formatOutputBool = function (param) {
    return param.staticPart() === '0000000000000000000000000000000000000000000000000000000000000001' ? true : false;
};

/**
 * Should be used to format output string
 *
 * @method formatOutputBytes
 * @param {SolidityParam} left-aligned hex representation of string
 * @returns {String} ascii string
 */
var formatOutputBytes = function (param) {
    // length might also be important!
    return utils.toAscii(param.staticPart());
};

/**
 * Should be used to format output string
 *
 * @method formatOutputDynamicBytes
 * @param {SolidityParam} left-aligned hex representation of string
 * @returns {String} ascii string
 */
var formatOutputDynamicBytes = function (param) {
    // length might also be important!
    return utils.toAscii(param.dynamicPart().slice(64));
};

/**
 * Should be used to format output address
 *
 * @method formatOutputAddress
 * @param {SolidityParam} right-aligned input bytes
 * @returns {String} address
 */
var formatOutputAddress = function (param) {
    var value = param.staticPart();
    return "0x" + value.slice(value.length - 40, value.length);
};

module.exports = {
    formatInputInt: formatInputInt,
    formatInputBytes: formatInputBytes,
    formatInputDynamicBytes: formatInputDynamicBytes,
    formatInputBool: formatInputBool,
    formatInputReal: formatInputReal,
    formatOutputInt: formatOutputInt,
    formatOutputUInt: formatOutputUInt,
    formatOutputReal: formatOutputReal,
    formatOutputUReal: formatOutputUReal,
    formatOutputBool: formatOutputBool,
    formatOutputBytes: formatOutputBytes,
    formatOutputDynamicBytes: formatOutputDynamicBytes,
    formatOutputAddress: formatOutputAddress
};


},{"../utils/config":5,"../utils/utils":7,"./param":3,"bignumber.js":"bignumber.js"}],3:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file param.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var utils = require('../utils/utils');

/**
 * SolidityParam object prototype.
 * Should be used when encoding, decoding solidity bytes
 */
var SolidityParam = function (value, offset) {
    this.value = value || '';
    this.offset = offset; // offset in bytes
};

/**
 * This method should be used to get length of params's dynamic part
 * 
 * @method dynamicPartLength
 * @returns {Number} length of dynamic part (in bytes)
 */
SolidityParam.prototype.dynamicPartLength = function () {
    return this.dynamicPart().length / 2;
};

/**
 * This method should be used to create copy of solidity param with different offset
 *
 * @method withOffset
 * @param {Number} offset length in bytes
 * @returns {SolidityParam} new solidity param with applied offset
 */
SolidityParam.prototype.withOffset = function (offset) {
    return new SolidityParam(this.value, offset);
};

/**
 * This method should be used to combine solidity params together
 * eg. when appending an array
 *
 * @method combine
 * @param {SolidityParam} param with which we should combine
 * @param {SolidityParam} result of combination
 */
SolidityParam.prototype.combine = function (param) {
    return new SolidityParam(this.value + param.value); 
};

/**
 * This method should be called to check if param has dynamic size.
 * If it has, it returns true, otherwise false
 *
 * @method isDynamic
 * @returns {Boolean}
 */
SolidityParam.prototype.isDynamic = function () {
    return this.value.length > 64 || this.offset !== undefined;
};

/**
 * This method should be called to transform offset to bytes
 *
 * @method offsetAsBytes
 * @returns {String} bytes representation of offset
 */
SolidityParam.prototype.offsetAsBytes = function () {
    return !this.isDynamic() ? '' : utils.padLeft(utils.toTwosComplement(this.offset).toString(16), 64);
};

/**
 * This method should be called to get static part of param
 *
 * @method staticPart
 * @returns {String} offset if it is a dynamic param, otherwise value
 */
SolidityParam.prototype.staticPart = function () {
    if (!this.isDynamic()) {
        return this.value; 
    } 
    return this.offsetAsBytes();
};

/**
 * This method should be called to get dynamic part of param
 *
 * @method dynamicPart
 * @returns {String} returns a value if it is a dynamic param, otherwise empty string
 */
SolidityParam.prototype.dynamicPart = function () {
    return this.isDynamic() ? this.value : '';
};

/**
 * This method should be called to encode param
 *
 * @method encode
 * @returns {String}
 */
SolidityParam.prototype.encode = function () {
    return this.staticPart() + this.dynamicPart();
};

/**
 * This method should be called to encode array of params
 *
 * @method encodeList
 * @param {Array[SolidityParam]} params
 * @returns {String}
 */
SolidityParam.encodeList = function (params) {
    
    // updating offsets
    var totalOffset = params.length * 32;
    var offsetParams = params.map(function (param) {
        if (!param.isDynamic()) {
            return param;
        }
        var offset = totalOffset;
        totalOffset += param.dynamicPartLength();
        return param.withOffset(offset);
    });

    // encode everything!
    return offsetParams.reduce(function (result, param) {
        return result + param.dynamicPart();
    }, offsetParams.reduce(function (result, param) {
        return result + param.staticPart();
    }, ''));
};

/**
 * This method should be used to decode plain (static) solidity param at given index
 *
 * @method decodeParam
 * @param {String} bytes
 * @param {Number} index
 * @returns {SolidityParam}
 */
SolidityParam.decodeParam = function (bytes, index) {
    index = index || 0;
    return new SolidityParam(bytes.substr(index * 64, 64)); 
};

/**
 * This method should be called to get offset value from bytes at given index
 *
 * @method getOffset
 * @param {String} bytes
 * @param {Number} index
 * @returns {Number} offset as number
 */
var getOffset = function (bytes, index) {
    // we can do this cause offset is rather small
    return parseInt('0x' + bytes.substr(index * 64, 64));
};

/**
 * This method should be called to decode solidity bytes param at given index
 *
 * @method decodeBytes
 * @param {String} bytes
 * @param {Number} index
 * @returns {SolidityParam}
 */
SolidityParam.decodeBytes = function (bytes, index) {
    index = index || 0;
    //TODO add support for strings longer than 32 bytes
    //var length = parseInt('0x' + bytes.substr(offset * 64, 64));

    var offset = getOffset(bytes, index);

    // 2 * , cause we also parse length
    return new SolidityParam(bytes.substr(offset * 2, 2 * 64), 0);
};

/**
 * This method should be used to decode solidity array at given index
 *
 * @method decodeArray
 * @param {String} bytes
 * @param {Number} index
 * @returns {SolidityParam}
 */
SolidityParam.decodeArray = function (bytes, index) {
    index = index || 0;
    var offset = getOffset(bytes, index);
    var length = parseInt('0x' + bytes.substr(offset * 2, 64));
    return new SolidityParam(bytes.substr(offset * 2, (length + 1) * 64), 0);
};

module.exports = SolidityParam;


},{"../utils/utils":7}],4:[function(require,module,exports){
'use strict';

// go env doesn't have and need XMLHttpRequest
if (typeof XMLHttpRequest === 'undefined') {
    exports.XMLHttpRequest = {};
} else {
    exports.XMLHttpRequest = XMLHttpRequest; // jshint ignore:line
}


},{}],5:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file config.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

/**
 * Utils
 * 
 * @module utils
 */

/**
 * Utility functions
 * 
 * @class [utils] config
 * @constructor
 */

/// required to define ETH_BIGNUMBER_ROUNDING_MODE
var BigNumber = require('bignumber.js');

var ETH_UNITS = [
    'wei',
    'kwei',
    'Mwei',
    'Gwei',
    'szabo',
    'finney',
    'femtoether',
    'picoether',
    'nanoether',
    'microether',
    'milliether',
    'nano',
    'micro',
    'milli',
    'ether',
    'grand',
    'Mether',
    'Gether',
    'Tether',
    'Pether',
    'Eether',
    'Zether',
    'Yether',
    'Nether',
    'Dether',
    'Vether',
    'Uether'
];

module.exports = {
    ETH_PADDING: 32,
    ETH_SIGNATURE_LENGTH: 4,
    ETH_UNITS: ETH_UNITS,
    ETH_BIGNUMBER_ROUNDING_MODE: { ROUNDING_MODE: BigNumber.ROUND_DOWN },
    ETH_POLLING_TIMEOUT: 1000,
    defaultBlock: 'latest',
    defaultAccount: undefined
};


},{"bignumber.js":"bignumber.js"}],6:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file sha3.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var utils = require('./utils');
var sha3 = require('crypto-js/sha3');

module.exports = function (str, isNew) {
    if (str.substr(0, 2) === '0x' && !isNew) {
        console.warn('requirement of using web3.fromAscii before sha3 is deprecated');
        console.warn('new usage: \'web3.sha3("hello")\'');
        console.warn('see https://github.com/ethereum/web3.js/pull/205');
        console.warn('if you need to hash hex value, you can do \'sha3("0xfff", true)\'');
        str = utils.toAscii(str);
    }

    return sha3(str, {
        outputLength: 256
    }).toString();
};


},{"./utils":7,"crypto-js/sha3":33}],7:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file utils.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

/**
 * Utils
 * 
 * @module utils
 */

/**
 * Utility functions
 * 
 * @class [utils] utils
 * @constructor
 */

var BigNumber = require('bignumber.js');

var unitMap = {
    'wei':          '1',
    'kwei':         '1000',
    'ada':          '1000',
    'femtoether':   '1000',
    'mwei':         '1000000',
    'babbage':      '1000000',
    'picoether':    '1000000',
    'gwei':         '1000000000',
    'shannon':      '1000000000',
    'nanoether':    '1000000000',
    'nano':         '1000000000',
    'szabo':        '1000000000000',
    'microether':   '1000000000000',
    'micro':        '1000000000000',
    'finney':       '1000000000000000',
    'milliether':    '1000000000000000',
    'milli':         '1000000000000000',
    'ether':        '1000000000000000000',
    'kether':       '1000000000000000000000',
    'grand':        '1000000000000000000000',
    'einstein':     '1000000000000000000000',
    'mether':       '1000000000000000000000000',
    'gether':       '1000000000000000000000000000',
    'tether':       '1000000000000000000000000000000'
};

/**
 * Should be called to pad string to expected length
 *
 * @method padLeft
 * @param {String} string to be padded
 * @param {Number} characters that result string should have
 * @param {String} sign, by default 0
 * @returns {String} right aligned string
 */
var padLeft = function (string, chars, sign) {
    return new Array(chars - string.length + 1).join(sign ? sign : "0") + string;
};

/** 
 * Should be called to get sting from it's hex representation
 *
 * @method toAscii
 * @param {String} string in hex
 * @returns {String} ascii string representation of hex value
 */
var toAscii = function(hex) {
// Find termination
    var str = "";
    var i = 0, l = hex.length;
    if (hex.substring(0, 2) === '0x') {
        i = 2;
    }
    for (; i < l; i+=2) {
        var code = parseInt(hex.substr(i, 2), 16);
        if (code === 0) {
            break;
        }

        str += String.fromCharCode(code);
    }

    return str;
};
    
/**
 * Shold be called to get hex representation (prefixed by 0x) of ascii string 
 *
 * @method toHexNative
 * @param {String} string
 * @returns {String} hex representation of input string
 */
var toHexNative = function(str) {
    var hex = "";
    for(var i = 0; i < str.length; i++) {
        var n = str.charCodeAt(i).toString(16);
        hex += n.length < 2 ? '0' + n : n;
    }

    return hex;
};

/**
 * Shold be called to get hex representation (prefixed by 0x) of ascii string 
 *
 * @method fromAscii
 * @param {String} string
 * @param {Number} optional padding
 * @returns {String} hex representation of input string
 */
var fromAscii = function(str, pad) {
    pad = pad === undefined ? 0 : pad;
    var hex = toHexNative(str);
    while (hex.length < pad*2)
        hex += "00";
    return "0x" + hex;
};

/**
 * Should be used to create full function/event name from json abi
 *
 * @method transformToFullName
 * @param {Object} json-abi
 * @return {String} full fnction/event name
 */
var transformToFullName = function (json) {
    if (json.name.indexOf('(') !== -1) {
        return json.name;
    }

    var typeName = json.inputs.map(function(i){return i.type; }).join();
    return json.name + '(' + typeName + ')';
};

/**
 * Should be called to get display name of contract function
 * 
 * @method extractDisplayName
 * @param {String} name of function/event
 * @returns {String} display name for function/event eg. multiply(uint256) -> multiply
 */
var extractDisplayName = function (name) {
    var length = name.indexOf('('); 
    return length !== -1 ? name.substr(0, length) : name;
};

/// @returns overloaded part of function/event name
var extractTypeName = function (name) {
    /// TODO: make it invulnerable
    var length = name.indexOf('(');
    return length !== -1 ? name.substr(length + 1, name.length - 1 - (length + 1)).replace(' ', '') : "";
};

/**
 * Converts value to it's decimal representation in string
 *
 * @method toDecimal
 * @param {String|Number|BigNumber}
 * @return {String}
 */
var toDecimal = function (value) {
    return toBigNumber(value).toNumber();
};

/**
 * Converts value to it's hex representation
 *
 * @method fromDecimal
 * @param {String|Number|BigNumber}
 * @return {String}
 */
var fromDecimal = function (value) {
    var number = toBigNumber(value);
    var result = number.toString(16);

    return number.lessThan(0) ? '-0x' + result.substr(1) : '0x' + result;
};

/**
 * Auto converts any given value into it's hex representation.
 *
 * And even stringifys objects before.
 *
 * @method toHex
 * @param {String|Number|BigNumber|Object}
 * @return {String}
 */
var toHex = function (val) {
    /*jshint maxcomplexity:7 */

    if (isBoolean(val))
        return fromDecimal(+val);

    if (isBigNumber(val))
        return fromDecimal(val);

    if (isObject(val))
        return fromAscii(JSON.stringify(val));

    // if its a negative number, pass it through fromDecimal
    if (isString(val)) {
        if (val.indexOf('-0x') === 0)
           return fromDecimal(val);
        else if (!isFinite(val))
            return fromAscii(val);
    }

    return fromDecimal(val);
};

/**
 * Returns value of unit in Wei
 *
 * @method getValueOfUnit
 * @param {String} unit the unit to convert to, default ether
 * @returns {BigNumber} value of the unit (in Wei)
 * @throws error if the unit is not correct:w
 */
var getValueOfUnit = function (unit) {
    unit = unit ? unit.toLowerCase() : 'ether';
    var unitValue = unitMap[unit];
    if (unitValue === undefined) {
        throw new Error('This unit doesn\'t exists, please use the one of the following units' + JSON.stringify(unitMap, null, 2));
    }
    return new BigNumber(unitValue, 10);
};

/**
 * Takes a number of wei and converts it to any other ether unit.
 *
 * Possible units are:
 *   SI Short   SI Full        Effigy       Other
 * - kwei       femtoether     ada
 * - mwei       picoether      babbage
 * - gwei       nanoether      shannon      nano
 * - --         microether     szabo        micro
 * - --         milliether     finney       milli
 * - ether      --             --
 * - kether                    einstein     grand 
 * - mether
 * - gether
 * - tether
 *
 * @method fromWei
 * @param {Number|String} number can be a number, number string or a HEX of a decimal
 * @param {String} unit the unit to convert to, default ether
 * @return {String|Object} When given a BigNumber object it returns one as well, otherwise a number
*/
var fromWei = function(number, unit) {
    var returnValue = toBigNumber(number).dividedBy(getValueOfUnit(unit));

    return isBigNumber(number) ? returnValue : returnValue.toString(10); 
};

/**
 * Takes a number of a unit and converts it to wei.
 *
 * Possible units are:
 *   SI Short   SI Full        Effigy       Other
 * - kwei       femtoether     ada
 * - mwei       picoether      babbage       
 * - gwei       nanoether      shannon      nano
 * - --         microether     szabo        micro
 * - --         milliether     finney       milli
 * - ether      --             --
 * - kether                    einstein     grand 
 * - mether
 * - gether
 * - tether
 *
 * @method toWei
 * @param {Number|String|BigNumber} number can be a number, number string or a HEX of a decimal
 * @param {String} unit the unit to convert from, default ether
 * @return {String|Object} When given a BigNumber object it returns one as well, otherwise a number
*/
var toWei = function(number, unit) {
    var returnValue = toBigNumber(number).times(getValueOfUnit(unit));

    return isBigNumber(number) ? returnValue : returnValue.toString(10); 
};

/**
 * Takes an input and transforms it into an bignumber
 *
 * @method toBigNumber
 * @param {Number|String|BigNumber} a number, string, HEX string or BigNumber
 * @return {BigNumber} BigNumber
*/
var toBigNumber = function(number) {
    /*jshint maxcomplexity:5 */
    number = number || 0;
    if (isBigNumber(number))
        return number;

    if (isString(number) && (number.indexOf('0x') === 0 || number.indexOf('-0x') === 0)) {
        return new BigNumber(number.replace('0x',''), 16);
    }
   
    return new BigNumber(number.toString(10), 10);
};

/**
 * Takes and input transforms it into bignumber and if it is negative value, into two's complement
 *
 * @method toTwosComplement
 * @param {Number|String|BigNumber}
 * @return {BigNumber}
 */
var toTwosComplement = function (number) {
    var bigNumber = toBigNumber(number);
    if (bigNumber.lessThan(0)) {
        return new BigNumber("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", 16).plus(bigNumber).plus(1);
    }
    return bigNumber;
};

/**
 * Checks if the given string is strictly an address
 *
 * @method isStrictAddress
 * @param {String} address the given HEX adress
 * @return {Boolean}
*/
var isStrictAddress = function (address) {
    return /^0x[0-9a-f]{40}$/.test(address);
};

/**
 * Checks if the given string is an address
 *
 * @method isAddress
 * @param {String} address the given HEX adress
 * @return {Boolean}
*/
var isAddress = function (address) {
    return /^(0x)?[0-9a-f]{40}$/.test(address);
};

/**
 * Transforms given string to valid 20 bytes-length addres with 0x prefix
 *
 * @method toAddress
 * @param {String} address
 * @return {String} formatted address
 */
var toAddress = function (address) {
    if (isStrictAddress(address)) {
        return address;
    }
    
    if (/^[0-9a-f]{40}$/.test(address)) {
        return '0x' + address;
    }

    return '0x' + padLeft(toHex(address).substr(2), 40);
};


/**
 * Returns true if object is BigNumber, otherwise false
 *
 * @method isBigNumber
 * @param {Object}
 * @return {Boolean} 
 */
var isBigNumber = function (object) {
    return object instanceof BigNumber ||
        (object && object.constructor && object.constructor.name === 'BigNumber');
};

/**
 * Returns true if object is string, otherwise false
 * 
 * @method isString
 * @param {Object}
 * @return {Boolean}
 */
var isString = function (object) {
    return typeof object === 'string' ||
        (object && object.constructor && object.constructor.name === 'String');
};

/**
 * Returns true if object is function, otherwise false
 *
 * @method isFunction
 * @param {Object}
 * @return {Boolean}
 */
var isFunction = function (object) {
    return typeof object === 'function';
};

/**
 * Returns true if object is Objet, otherwise false
 *
 * @method isObject
 * @param {Object}
 * @return {Boolean}
 */
var isObject = function (object) {
    return typeof object === 'object';
};

/**
 * Returns true if object is boolean, otherwise false
 *
 * @method isBoolean
 * @param {Object}
 * @return {Boolean}
 */
var isBoolean = function (object) {
    return typeof object === 'boolean';
};

/**
 * Returns true if object is array, otherwise false
 *
 * @method isArray
 * @param {Object}
 * @return {Boolean}
 */
var isArray = function (object) {
    return object instanceof Array; 
};

/**
 * Returns true if given string is valid json object
 * 
 * @method isJson
 * @param {String}
 * @return {Boolean}
 */
var isJson = function (str) {
    try {
        return !!JSON.parse(str);
    } catch (e) {
        return false;
    }
};

/**
 * This method should be called to check if string is valid ethereum IBAN number
 * Supports direct and indirect IBANs
 *
 * @method isIBAN
 * @param {String}
 * @return {Boolean}
 */
var isIBAN = function (iban) {
    return /^XE[0-9]{2}(ETH[0-9A-Z]{13}|[0-9A-Z]{30})$/.test(iban);
};

module.exports = {
    padLeft: padLeft,
    toHex: toHex,
    toDecimal: toDecimal,
    fromDecimal: fromDecimal,
    toAscii: toAscii,
    fromAscii: fromAscii,
    transformToFullName: transformToFullName,
    extractDisplayName: extractDisplayName,
    extractTypeName: extractTypeName,
    toWei: toWei,
    fromWei: fromWei,
    toBigNumber: toBigNumber,
    toTwosComplement: toTwosComplement,
    toAddress: toAddress,
    isBigNumber: isBigNumber,
    isStrictAddress: isStrictAddress,
    isAddress: isAddress,
    isFunction: isFunction,
    isString: isString,
    isObject: isObject,
    isBoolean: isBoolean,
    isArray: isArray,
    isJson: isJson,
    isIBAN: isIBAN
};


},{"bignumber.js":"bignumber.js"}],8:[function(require,module,exports){
module.exports={
    "version": "0.5.0"
}

},{}],9:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file web3.js
 * @authors:
 *   Jeffrey Wilcke <jeff@ethdev.com>
 *   Marek Kotewicz <marek@ethdev.com>
 *   Marian Oancea <marian@ethdev.com>
 *   Fabian Vogelsteller <fabian@ethdev.com>
 *   Gav Wood <g@ethdev.com>
 * @date 2014
 */

var version = require('./version.json');
var net = require('./web3/net');
var eth = require('./web3/eth');
var db = require('./web3/db');
var shh = require('./web3/shh');
var watches = require('./web3/watches');
var Filter = require('./web3/filter');
var utils = require('./utils/utils');
var formatters = require('./web3/formatters');
var RequestManager = require('./web3/requestmanager');
var Method = require('./web3/method');
var c = require('./utils/config');
var Property = require('./web3/property');
var Batch = require('./web3/batch');
var sha3 = require('./utils/sha3');

var web3Properties = [
    new Property({
        name: 'version.client',
        getter: 'web3_clientVersion'
    }),
    new Property({
        name: 'version.network',
        getter: 'net_version',
        inputFormatter: utils.toDecimal
    }),
    new Property({
        name: 'version.ethereum',
        getter: 'eth_protocolVersion',
        inputFormatter: utils.toDecimal
    }),
    new Property({
        name: 'version.whisper',
        getter: 'shh_version',
        inputFormatter: utils.toDecimal
    })
];

/// creates methods in a given object based on method description on input
/// setups api calls for these methods
var setupMethods = function (obj, methods) {
    methods.forEach(function (method) {
        method.attachToObject(obj);
    });
};

/// creates properties in a given object based on properties description on input
/// setups api calls for these properties
var setupProperties = function (obj, properties) {
    properties.forEach(function (property) {
        property.attachToObject(obj);
    });
};

/// setups web3 object, and it's in-browser executed methods
var web3 = {};
web3.providers = {};
web3.version = {};
web3.version.api = version.version;
web3.eth = {};

/*jshint maxparams:4 */
web3.eth.filter = function (fil, eventParams, options, formatter) {

    // if its event, treat it differently
    // TODO: simplify and remove
    if (fil._isEvent) {
        return fil(eventParams, options);
    }

    // what outputLogFormatter? that's wrong
    //return new Filter(fil, watches.eth(), formatters.outputLogFormatter);
    return new Filter(fil, watches.eth(), formatter || formatters.outputLogFormatter);
};
/*jshint maxparams:3 */

web3.shh = {};
web3.shh.filter = function (fil) {
    return new Filter(fil, watches.shh(), formatters.outputPostFormatter);
};
web3.net = {};
web3.db = {};
web3.setProvider = function (provider) {
    RequestManager.getInstance().setProvider(provider);
};
web3.reset = function () {
    RequestManager.getInstance().reset();
    c.defaultBlock = 'latest';
    c.defaultAccount = undefined;
};
web3.toHex = utils.toHex;
web3.toAscii = utils.toAscii;
web3.fromAscii = utils.fromAscii;
web3.toDecimal = utils.toDecimal;
web3.fromDecimal = utils.fromDecimal;
web3.toBigNumber = utils.toBigNumber;
web3.toWei = utils.toWei;
web3.fromWei = utils.fromWei;
web3.isAddress = utils.isAddress;
web3.isIBAN = utils.isIBAN;
web3.sha3 = sha3;
web3.createBatch = function () {
    return new Batch();
};

// ADD defaultblock
Object.defineProperty(web3.eth, 'defaultBlock', {
    get: function () {
        return c.defaultBlock;
    },
    set: function (val) {
        c.defaultBlock = val;
        return val;
    }
});

Object.defineProperty(web3.eth, 'defaultAccount', {
    get: function () {
        return c.defaultAccount;
    },
    set: function (val) {
        c.defaultAccount = val;
        return val;
    }
});

/// setups all api methods
setupProperties(web3, web3Properties);
setupMethods(web3.net, net.methods);
setupProperties(web3.net, net.properties);
setupMethods(web3.eth, eth.methods);
setupProperties(web3.eth, eth.properties);
setupMethods(web3.db, db.methods);
setupMethods(web3.shh, shh.methods);

web3.admin = {};
web3.admin.setSessionKey = function(s) { web3.admin.sessionKey = s; };

var blockQueueStatus = new Method({
	name: 'blockQueueStatus',
	call: 'admin_eth_blockQueueStatus',
	params: 1,
	inputFormatter: [function() { return web3.admin.sessionKey; }]
});

setupMethods(web3.admin, [blockQueueStatus]);

module.exports = web3;


},{"./utils/config":5,"./utils/sha3":6,"./utils/utils":7,"./version.json":8,"./web3/batch":10,"./web3/db":12,"./web3/eth":14,"./web3/filter":16,"./web3/formatters":17,"./web3/method":22,"./web3/net":24,"./web3/property":25,"./web3/requestmanager":27,"./web3/shh":28,"./web3/watches":30}],10:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file batch.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var RequestManager = require('./requestmanager');

var Batch = function () {
    this.requests = [];
};

/**
 * Should be called to add create new request to batch request
 *
 * @method add
 * @param {Object} jsonrpc requet object
 */
Batch.prototype.add = function (request) {
    this.requests.push(request);
};

/**
 * Should be called to execute batch request
 *
 * @method execute
 */
Batch.prototype.execute = function () {
    var requests = this.requests;
    RequestManager.getInstance().sendBatch(requests, function (err, results) {
        results = results || [];
        requests.map(function (request, index) {
            return results[index] || {};
        }).map(function (result, index) {
            return requests[index].format ? requests[index].format(result.result) : result.result;
        }).forEach(function (result, index) {
            if (requests[index].callback) {
                requests[index].callback(err, result);
            }
        });
    }); 
};

module.exports = Batch;


},{"./requestmanager":27}],11:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file contract.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2014
 */

var web3 = require('../web3'); 
var utils = require('../utils/utils');
var coder = require('../solidity/coder');
var SolidityEvent = require('./event');
var SolidityFunction = require('./function');

/**
 * Should be called to encode constructor params
 *
 * @method encodeConstructorParams
 * @param {Array} abi
 * @param {Array} constructor params
 */
var encodeConstructorParams = function (abi, params) {
    return abi.filter(function (json) {
        return json.type === 'constructor' && json.inputs.length === params.length;
    }).map(function (json) {
        return json.inputs.map(function (input) {
            return input.type;
        });
    }).map(function (types) {
        return coder.encodeParams(types, params);
    })[0] || '';
};

/**
 * Should be called to add functions to contract object
 *
 * @method addFunctionsToContract
 * @param {Contract} contract
 * @param {Array} abi
 */
var addFunctionsToContract = function (contract, abi) {
    abi.filter(function (json) {
        return json.type === 'function';
    }).map(function (json) {
        return new SolidityFunction(json, contract.address);
    }).forEach(function (f) {
        f.attachToContract(contract);
    });
};

/**
 * Should be called to add events to contract object
 *
 * @method addEventsToContract
 * @param {Contract} contract
 * @param {Array} abi
 */
var addEventsToContract = function (contract, abi) {
    abi.filter(function (json) {
        return json.type === 'event';
    }).map(function (json) {
        return new SolidityEvent(json, contract.address);
    }).forEach(function (e) {
        e.attachToContract(contract);
    });
};

/**
 * Should be called to create new ContractFactory
 *
 * @method contract
 * @param {Array} abi
 * @returns {ContractFactory} new contract factory
 */
var contract = function (abi) {
    return new ContractFactory(abi);
};

/**
 * Should be called to create new ContractFactory instance
 *
 * @method ContractFactory
 * @param {Array} abi
 */
var ContractFactory = function (abi) {
    this.abi = abi;
};

/**
 * Should be called to create new contract on a blockchain
 * 
 * @method new
 * @param {Any} contract constructor param1 (optional)
 * @param {Any} contract constructor param2 (optional)
 * @param {Object} contract transaction object (required)
 * @param {Function} callback
 * @returns {Contract} returns contract if no callback was passed,
 * otherwise calls callback function (err, contract)
 */
ContractFactory.prototype.new = function () {
    // parse arguments
    var options = {}; // required!
    var callback;

    var args = Array.prototype.slice.call(arguments);
    if (utils.isFunction(args[args.length - 1])) {
        callback = args.pop();
    }

    var last = args[args.length - 1];
    if (utils.isObject(last) && !utils.isArray(last)) {
        options = args.pop();
    }

    // throw an error if there are no options

    var bytes = encodeConstructorParams(this.abi, args);
    options.data += bytes;

    if (!callback) {
        var address = web3.eth.sendTransaction(options);
        return this.at(address);
    }
  
    var self = this;
    web3.eth.sendTransaction(options, function (err, address) {
        if (err) {
            callback(err);
        }
        self.at(address, callback); 
    }); 
};

/**
 * Should be called to get access to existing contract on a blockchain
 *
 * @method at
 * @param {Address} contract address (required)
 * @param {Function} callback {optional)
 * @returns {Contract} returns contract if no callback was passed,
 * otherwise calls callback function (err, contract)
 */
ContractFactory.prototype.at = function (address, callback) {
    // TODO: address is required
    
    if (callback) {
        callback(null, new Contract(this.abi, address));
    } 
    return new Contract(this.abi, address);
};

/**
 * Should be called to create new contract instance
 *
 * @method Contract
 * @param {Array} abi
 * @param {Address} contract address
 */
var Contract = function (abi, address) {
    this.address = address;
    addFunctionsToContract(this, abi);
    addEventsToContract(this, abi);
};

module.exports = contract;


},{"../solidity/coder":1,"../utils/utils":7,"../web3":9,"./event":15,"./function":18}],12:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file db.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var Method = require('./method');

var putString = new Method({
    name: 'putString',
    call: 'db_putString',
    params: 3
});


var getString = new Method({
    name: 'getString',
    call: 'db_getString',
    params: 2
});

var putHex = new Method({
    name: 'putHex',
    call: 'db_putHex',
    params: 3
});

var getHex = new Method({
    name: 'getHex',
    call: 'db_getHex',
    params: 2
});

var methods = [
    putString, getString, putHex, getHex
];

module.exports = {
    methods: methods
};

},{"./method":22}],13:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file errors.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

module.exports = {
    InvalidNumberOfParams: function () {
        return new Error('Invalid number of input parameters');
    },
    InvalidConnection: function (host){
        return new Error('CONNECTION ERROR: Couldn\'t connect to node '+ host +', is it running?');
    },
    InvalidProvider: function () {
        return new Error('Providor not set or invalid');
    },
    InvalidResponse: function (result){
        var message = !!result && !!result.error && !!result.error.message ? result.error.message : 'Invalid JSON RPC response';
        return new Error(message);
    }
};


},{}],14:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @file eth.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @author Fabian Vogelsteller <fabian@ethdev.com>
 * @date 2015
 */

/**
 * Web3
 *
 * @module web3
 */

/**
 * Eth methods and properties
 *
 * An example method object can look as follows:
 *
 *      {
 *      name: 'getBlock',
 *      call: blockCall,
 *      params: 2,
 *      outputFormatter: formatters.outputBlockFormatter,
 *      inputFormatter: [ // can be a formatter funciton or an array of functions. Where each item in the array will be used for one parameter
 *           utils.toHex, // formats paramter 1
 *           function(param){ return !!param; } // formats paramter 2
 *         ]
 *       },
 *
 * @class [web3] eth
 * @constructor
 */

"use strict";

var formatters = require('./formatters');
var utils = require('../utils/utils');
var Method = require('./method');
var Property = require('./property');

var blockCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? "eth_getBlockByHash" : "eth_getBlockByNumber";
};

var transactionFromBlockCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'eth_getTransactionByBlockHashAndIndex' : 'eth_getTransactionByBlockNumberAndIndex';
};

var uncleCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'eth_getUncleByBlockHashAndIndex' : 'eth_getUncleByBlockNumberAndIndex';
};

var getBlockTransactionCountCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'eth_getBlockTransactionCountByHash' : 'eth_getBlockTransactionCountByNumber';
};

var uncleCountCall = function (args) {
    return (utils.isString(args[0]) && args[0].indexOf('0x') === 0) ? 'eth_getUncleCountByBlockHash' : 'eth_getUncleCountByBlockNumber';
};

/// @returns an array of objects describing web3.eth api methods

var getBalance = new Method({
	name: 'getBalance',
	call: 'eth_getBalance',
	params: 2,
	inputFormatter: [utils.toAddress, formatters.inputDefaultBlockNumberFormatter],
	outputFormatter: formatters.outputBigNumberFormatter
});

var getStorageAt = new Method({
    name: 'getStorageAt',
    call: 'eth_getStorageAt',
    params: 3,
    inputFormatter: [null, utils.toHex, formatters.inputDefaultBlockNumberFormatter]
});

var getCode = new Method({
    name: 'getCode',
    call: 'eth_getCode',
    params: 2,
    inputFormatter: [utils.toAddress, formatters.inputDefaultBlockNumberFormatter]
});

var getBlock = new Method({
    name: 'getBlock',
    call: blockCall,
    params: 2,
    inputFormatter: [formatters.inputBlockNumberFormatter, function (val) { return !!val; }],
    outputFormatter: formatters.outputBlockFormatter
});

var getUncle = new Method({
    name: 'getUncle',
    call: uncleCall,
    params: 2,
    inputFormatter: [formatters.inputBlockNumberFormatter, utils.toHex],
    outputFormatter: formatters.outputBlockFormatter,

});

var getCompilers = new Method({
    name: 'getCompilers',
    call: 'eth_getCompilers',
    params: 0
});

var getBlockTransactionCount = new Method({
    name: 'getBlockTransactionCount',
    call: getBlockTransactionCountCall,
    params: 1,
    inputFormatter: [formatters.inputBlockNumberFormatter],
    outputFormatter: utils.toDecimal
});

var getBlockUncleCount = new Method({
    name: 'getBlockUncleCount',
    call: uncleCountCall,
    params: 1,
    inputFormatter: [formatters.inputBlockNumberFormatter],
    outputFormatter: utils.toDecimal
});

var getTransaction = new Method({
    name: 'getTransaction',
    call: 'eth_getTransactionByHash',
    params: 1,
    outputFormatter: formatters.outputTransactionFormatter
});

var getTransactionFromBlock = new Method({
    name: 'getTransactionFromBlock',
    call: transactionFromBlockCall,
    params: 2,
    inputFormatter: [formatters.inputBlockNumberFormatter, utils.toHex],
    outputFormatter: formatters.outputTransactionFormatter
});

var getTransactionCount = new Method({
    name: 'getTransactionCount',
    call: 'eth_getTransactionCount',
    params: 2,
    inputFormatter: [null, formatters.inputDefaultBlockNumberFormatter],
    outputFormatter: utils.toDecimal
});

var sendTransaction = new Method({
    name: 'sendTransaction',
    call: 'eth_sendTransaction',
    params: 1,
    inputFormatter: [formatters.inputTransactionFormatter]
});

var call = new Method({
    name: 'call',
    call: 'eth_call',
    params: 2,
    inputFormatter: [formatters.inputTransactionFormatter, formatters.inputDefaultBlockNumberFormatter]
});

var estimateGas = new Method({
    name: 'estimateGas',
    call: 'eth_estimateGas',
    params: 1,
    inputFormatter: [formatters.inputTransactionFormatter],
    outputFormatter: utils.toDecimal
});

var compileSolidity = new Method({
    name: 'compile.solidity',
    call: 'eth_compileSolidity',
    params: 1
});

var compileLLL = new Method({
    name: 'compile.lll',
    call: 'eth_compileLLL',
    params: 1
});

var compileSerpent = new Method({
    name: 'compile.serpent',
    call: 'eth_compileSerpent',
    params: 1
});

var submitWork = new Method({
    name: 'submitWork',
    call: 'eth_submitWork',
    params: 3
});

var getWork = new Method({
    name: 'getWork',
    call: 'eth_getWork',
    params: 0
});

var methods = [
    getBalance,
    getStorageAt,
    getCode,
    getBlock,
    getUncle,
    getCompilers,
    getBlockTransactionCount,
    getBlockUncleCount,
    getTransaction,
    getTransactionFromBlock,
    getTransactionCount,
    call,
    estimateGas,
    sendTransaction,
    compileSolidity,
    compileLLL,
    compileSerpent,
    submitWork,
    getWork
];

/// @returns an array of objects describing web3.eth api properties



var properties = [
    new Property({
        name: 'coinbase',
        getter: 'eth_coinbase'
    }),
    new Property({
        name: 'mining',
        getter: 'eth_mining'
    }),
    new Property({
        name: 'hashrate',
        getter: 'eth_hashrate',
        outputFormatter: utils.toDecimal
    }),
    new Property({
        name: 'gasPrice',
        getter: 'eth_gasPrice',
        outputFormatter: formatters.outputBigNumberFormatter
    }),
    new Property({
        name: 'accounts',
        getter: 'eth_accounts'
    }),
    new Property({
        name: 'blockNumber',
        getter: 'eth_blockNumber',
        outputFormatter: utils.toDecimal
    })
];

module.exports = {
    methods: methods,
    properties: properties
};


},{"../utils/utils":7,"./formatters":17,"./method":22,"./property":25}],15:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file event.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2014
 */

var utils = require('../utils/utils');
var coder = require('../solidity/coder');
var web3 = require('../web3');
var formatters = require('./formatters');
var sha3 = require('../utils/sha3');

/**
 * This prototype should be used to create event filters
 */
var SolidityEvent = function (json, address) {
    this._params = json.inputs;
    this._name = utils.transformToFullName(json);
    this._address = address;
    this._anonymous = json.anonymous;
};

/**
 * Should be used to get filtered param types
 *
 * @method types
 * @param {Bool} decide if returned typed should be indexed
 * @return {Array} array of types
 */
SolidityEvent.prototype.types = function (indexed) {
    return this._params.filter(function (i) {
        return i.indexed === indexed;
    }).map(function (i) {
        return i.type;
    });
};

/**
 * Should be used to get event display name
 *
 * @method displayName
 * @return {String} event display name
 */
SolidityEvent.prototype.displayName = function () {
    return utils.extractDisplayName(this._name);
};

/**
 * Should be used to get event type name
 *
 * @method typeName
 * @return {String} event type name
 */
SolidityEvent.prototype.typeName = function () {
    return utils.extractTypeName(this._name);
};

/**
 * Should be used to get event signature
 *
 * @method signature
 * @return {String} event signature
 */
SolidityEvent.prototype.signature = function () {
    return sha3(this._name);
};

/**
 * Should be used to encode indexed params and options to one final object
 * 
 * @method encode
 * @param {Object} indexed
 * @param {Object} options
 * @return {Object} everything combined together and encoded
 */
SolidityEvent.prototype.encode = function (indexed, options) {
    indexed = indexed || {};
    options = options || {};
    var result = {};

    ['fromBlock', 'toBlock'].filter(function (f) {
        return options[f] !== undefined;
    }).forEach(function (f) {
        result[f] = formatters.inputBlockNumberFormatter(options[f]);
    });

    result.topics = [];

    if (!this._anonymous) {
        result.address = this._address;
        result.topics.push('0x' + this.signature());
    }

    var indexedTopics = this._params.filter(function (i) {
        return i.indexed === true;
    }).map(function (i) {
        var value = indexed[i.name];
        if (value === undefined || value === null) {
            return null;
        }
        
        if (utils.isArray(value)) {
            return value.map(function (v) {
                return '0x' + coder.encodeParam(i.type, v);
            });
        }
        return '0x' + coder.encodeParam(i.type, value);
    });

    result.topics = result.topics.concat(indexedTopics);

    return result;
};

/**
 * Should be used to decode indexed params and options
 *
 * @method decode
 * @param {Object} data
 * @return {Object} result object with decoded indexed && not indexed params
 */
SolidityEvent.prototype.decode = function (data) {
 
    data.data = data.data || '';
    data.topics = data.topics || [];

    var argTopics = this._anonymous ? data.topics : data.topics.slice(1);
    var indexedData = argTopics.map(function (topics) { return topics.slice(2); }).join("");
    var indexedParams = coder.decodeParams(this.types(true), indexedData); 

    var notIndexedData = data.data.slice(2);
    var notIndexedParams = coder.decodeParams(this.types(false), notIndexedData);
    
    var result = formatters.outputLogFormatter(data);
    result.event = this.displayName();
    result.address = data.address;

    result.args = this._params.reduce(function (acc, current) {
        acc[current.name] = current.indexed ? indexedParams.shift() : notIndexedParams.shift();
        return acc;
    }, {});

    delete result.data;
    delete result.topics;

    return result;
};

/**
 * Should be used to create new filter object from event
 *
 * @method execute
 * @param {Object} indexed
 * @param {Object} options
 * @return {Object} filter object
 */
SolidityEvent.prototype.execute = function (indexed, options) {
    var o = this.encode(indexed, options);
    var formatter = this.decode.bind(this);
    return web3.eth.filter(o, undefined, undefined, formatter);
};

/**
 * Should be used to attach event to contract object
 *
 * @method attachToContract
 * @param {Contract}
 */
SolidityEvent.prototype.attachToContract = function (contract) {
    var execute = this.execute.bind(this);
    var displayName = this.displayName();
    if (!contract[displayName]) {
        contract[displayName] = execute;
    }
    contract[displayName][this.typeName()] = this.execute.bind(this, contract);
};

module.exports = SolidityEvent;


},{"../solidity/coder":1,"../utils/sha3":6,"../utils/utils":7,"../web3":9,"./formatters":17}],16:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file filter.js
 * @authors:
 *   Jeffrey Wilcke <jeff@ethdev.com>
 *   Marek Kotewicz <marek@ethdev.com>
 *   Marian Oancea <marian@ethdev.com>
 *   Fabian Vogelsteller <fabian@ethdev.com>
 *   Gav Wood <g@ethdev.com>
 * @date 2014
 */

var RequestManager = require('./requestmanager');
var formatters = require('./formatters');
var utils = require('../utils/utils');

/**
* Converts a given topic to a hex string, but also allows null values.
*
* @param {Mixed} value
* @return {String}
*/
var toTopic = function(value){

    if(value === null || typeof value === 'undefined')
        return null;

    value = String(value);

    if(value.indexOf('0x') === 0)
        return value;
    else
        return utils.fromAscii(value);
};

/// This method should be called on options object, to verify deprecated properties && lazy load dynamic ones
/// @param should be string or object
/// @returns options string or object
var getOptions = function (options) {

    if (utils.isString(options)) {
        return options;
    } 

    options = options || {};

    // make sure topics, get converted to hex
    options.topics = options.topics || [];
    options.topics = options.topics.map(function(topic){
        return (utils.isArray(topic)) ? topic.map(toTopic) : toTopic(topic);
    });

    // lazy load
    return {
        topics: options.topics,
        to: options.to,
        address: options.address,
        fromBlock: formatters.inputBlockNumberFormatter(options.fromBlock),
        toBlock: formatters.inputBlockNumberFormatter(options.toBlock) 
    }; 
};

var Filter = function (options, methods, formatter) {
    var implementation = {};
    methods.forEach(function (method) {
        method.attachToObject(implementation);
    });
    this.options = getOptions(options);
    this.implementation = implementation;
    this.callbacks = [];
    this.formatter = formatter;
    this.filterId = this.implementation.newFilter(this.options);
};

Filter.prototype.watch = function (callback) {
    this.callbacks.push(callback);
    var self = this;

    var onMessage = function (error, messages) {
        if (error) {
            return self.callbacks.forEach(function (callback) {
                callback(error);
            });
        }

        messages.forEach(function (message) {
            message = self.formatter ? self.formatter(message) : message;
            self.callbacks.forEach(function (callback) {
                callback(null, message);
            });
        });
    };

    // call getFilterLogs on start
    if (!utils.isString(this.options)) {
        this.get(function (err, messages) {
            // don't send all the responses to all the watches again... just to this one
            if (err) {
                callback(err);
            }

            messages.forEach(function (message) {
                callback(null, message);
            });
        });
    }

    RequestManager.getInstance().startPolling({
        method: this.implementation.poll.call,
        params: [this.filterId],
    }, this.filterId, onMessage, this.stopWatching.bind(this));
};

Filter.prototype.stopWatching = function () {
    RequestManager.getInstance().stopPolling(this.filterId);
    this.implementation.uninstallFilter(this.filterId);
    this.callbacks = [];
};

Filter.prototype.get = function (callback) {
    var self = this;
    if (utils.isFunction(callback)) {
        this.implementation.getLogs(this.filterId, function(err, res){
            if (err) {
                callback(err);
            } else {
                callback(null, res.map(function (log) {
                    return self.formatter ? self.formatter(log) : log;
                }));
            }
        });
    } else {
        var logs = this.implementation.getLogs(this.filterId);
        return logs.map(function (log) {
            return self.formatter ? self.formatter(log) : log;
        });
    }
};

module.exports = Filter;


},{"../utils/utils":7,"./formatters":17,"./requestmanager":27}],17:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file formatters.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @author Fabian Vogelsteller <fabian@ethdev.com>
 * @date 2015
 */

var utils = require('../utils/utils');
var config = require('../utils/config');

/**
 * Should the format output to a big number
 *
 * @method outputBigNumberFormatter
 * @param {String|Number|BigNumber}
 * @returns {BigNumber} object
 */
var outputBigNumberFormatter = function (number) {
    return utils.toBigNumber(number);
};

var isPredefinedBlockNumber = function (blockNumber) {
    return blockNumber === 'latest' || blockNumber === 'pending' || blockNumber === 'earliest';
};

var inputDefaultBlockNumberFormatter = function (blockNumber) {
    if (blockNumber === undefined) {
        return config.defaultBlock;
    }
    return inputBlockNumberFormatter(blockNumber);
};

var inputBlockNumberFormatter = function (blockNumber) {
    if (blockNumber === undefined) {
        return undefined;
    } else if (isPredefinedBlockNumber(blockNumber)) {
        return blockNumber;
    }
    return utils.toHex(blockNumber);
};

/**
 * Formats the input of a transaction and converts all values to HEX
 *
 * @method inputTransactionFormatter
 * @param {Object} transaction options
 * @returns object
*/
var inputTransactionFormatter = function (options){

    options.from = options.from || config.defaultAccount;

    // make code -> data
    if (options.code) {
        options.data = options.code;
        delete options.code;
    }

    ['gasPrice', 'gas', 'value', 'nonce'].filter(function (key) {
        return options[key] !== undefined;
    }).forEach(function(key){
        options[key] = utils.fromDecimal(options[key]);
    });

    return options; 
};

/**
 * Formats the output of a transaction to its proper values
 * 
 * @method outputTransactionFormatter
 * @param {Object} transaction
 * @returns {Object} transaction
*/
var outputTransactionFormatter = function (tx){
    tx.blockNumber = utils.toDecimal(tx.blockNumber);
    tx.transactionIndex = utils.toDecimal(tx.transactionIndex);
    tx.nonce = utils.toDecimal(tx.nonce);
    tx.gas = utils.toDecimal(tx.gas);
    tx.gasPrice = utils.toBigNumber(tx.gasPrice);
    tx.value = utils.toBigNumber(tx.value);
    return tx;
};

/**
 * Formats the output of a block to its proper values
 *
 * @method outputBlockFormatter
 * @param {Object} block object 
 * @returns {Object} block object
*/
var outputBlockFormatter = function(block) {

    // transform to number
    block.gasLimit = utils.toDecimal(block.gasLimit);
    block.gasUsed = utils.toDecimal(block.gasUsed);
    block.size = utils.toDecimal(block.size);
    block.timestamp = utils.toDecimal(block.timestamp);
    block.number = utils.toDecimal(block.number);

    block.difficulty = utils.toBigNumber(block.difficulty);
    block.totalDifficulty = utils.toBigNumber(block.totalDifficulty);

    if (utils.isArray(block.transactions)) {
        block.transactions.forEach(function(item){
            if(!utils.isString(item))
                return outputTransactionFormatter(item);
        });
    }

    return block;
};

/**
 * Formats the output of a log
 * 
 * @method outputLogFormatter
 * @param {Object} log object
 * @returns {Object} log
*/
var outputLogFormatter = function(log) {
    if (log === null) { // 'pending' && 'latest' filters are nulls
        return null;
    }

    log.blockNumber = utils.toDecimal(log.blockNumber);
    log.transactionIndex = utils.toDecimal(log.transactionIndex);
    log.logIndex = utils.toDecimal(log.logIndex);

    return log;
};

/**
 * Formats the input of a whisper post and converts all values to HEX
 *
 * @method inputPostFormatter
 * @param {Object} transaction object
 * @returns {Object}
*/
var inputPostFormatter = function(post) {

    post.payload = utils.toHex(post.payload);
    post.ttl = utils.fromDecimal(post.ttl);
    post.workToProve = utils.fromDecimal(post.workToProve);
    post.priority = utils.fromDecimal(post.priority);

    // fallback
    if (!utils.isArray(post.topics)) {
        post.topics = post.topics ? [post.topics] : [];
    }

    // format the following options
    post.topics = post.topics.map(function(topic){
        return utils.fromAscii(topic);
    });

    return post; 
};

/**
 * Formats the output of a received post message
 *
 * @method outputPostFormatter
 * @param {Object}
 * @returns {Object}
 */
var outputPostFormatter = function(post){

    post.expiry = utils.toDecimal(post.expiry);
    post.sent = utils.toDecimal(post.sent);
    post.ttl = utils.toDecimal(post.ttl);
    post.workProved = utils.toDecimal(post.workProved);
    post.payloadRaw = post.payload;
    post.payload = utils.toAscii(post.payload);

    if (utils.isJson(post.payload)) {
        post.payload = JSON.parse(post.payload);
    }

    // format the following options
    if (!post.topics) {
        post.topics = [];
    }
    post.topics = post.topics.map(function(topic){
        return utils.toAscii(topic);
    });

    return post;
};

module.exports = {
    inputDefaultBlockNumberFormatter: inputDefaultBlockNumberFormatter,
    inputBlockNumberFormatter: inputBlockNumberFormatter,
    inputTransactionFormatter: inputTransactionFormatter,
    inputPostFormatter: inputPostFormatter,
    outputBigNumberFormatter: outputBigNumberFormatter,
    outputTransactionFormatter: outputTransactionFormatter,
    outputBlockFormatter: outputBlockFormatter,
    outputLogFormatter: outputLogFormatter,
    outputPostFormatter: outputPostFormatter
};


},{"../utils/config":5,"../utils/utils":7}],18:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @file function.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var web3 = require('../web3');
var coder = require('../solidity/coder');
var utils = require('../utils/utils');
var sha3 = require('../utils/sha3');

/**
 * This prototype should be used to call/sendTransaction to solidity functions
 */
var SolidityFunction = function (json, address) {
    this._inputTypes = json.inputs.map(function (i) {
        return i.type;
    });
    this._outputTypes = json.outputs.map(function (i) {
        return i.type;
    });
    this._constant = json.constant;
    this._name = utils.transformToFullName(json);
    this._address = address;
};

SolidityFunction.prototype.extractCallback = function (args) {
    if (utils.isFunction(args[args.length - 1])) {
        return args.pop(); // modify the args array!
    }
};

/**
 * Should be used to create payload from arguments
 *
 * @method toPayload
 * @param {Array} solidity function params
 * @param {Object} optional payload options
 */
SolidityFunction.prototype.toPayload = function (args) {
    var options = {};
    if (args.length > this._inputTypes.length && utils.isObject(args[args.length -1])) {
        options = args[args.length - 1];
    }
    options.to = this._address;
    options.data = '0x' + this.signature() + coder.encodeParams(this._inputTypes, args);
    return options;
};

/**
 * Should be used to get function signature
 *
 * @method signature
 * @return {String} function signature
 */
SolidityFunction.prototype.signature = function () {
    return sha3(this._name).slice(0, 8);
};


SolidityFunction.prototype.unpackOutput = function (output) {
    if (!output) {
        return;
    }

    output = output.length >= 2 ? output.slice(2) : output;
    var result = coder.decodeParams(this._outputTypes, output);
    return result.length === 1 ? result[0] : result;
};

/**
 * Calls a contract function.
 *
 * @method call
 * @param {...Object} Contract function arguments
 * @param {function} If the last argument is a function, the contract function
 *   call will be asynchronous, and the callback will be passed the
 *   error and result.
 * @return {String} output bytes
 */
SolidityFunction.prototype.call = function () {
    var args = Array.prototype.slice.call(arguments).filter(function (a) {return a !== undefined; });
    var callback = this.extractCallback(args);
    var payload = this.toPayload(args);

    if (!callback) {
        var output = web3.eth.call(payload);
        return this.unpackOutput(output);
    } 
        
    var self = this;
    web3.eth.call(payload, function (error, output) {
        callback(error, self.unpackOutput(output));
    });
};

/**
 * Should be used to sendTransaction to solidity function
 *
 * @method sendTransaction
 * @param {Object} options
 */
SolidityFunction.prototype.sendTransaction = function () {
    var args = Array.prototype.slice.call(arguments).filter(function (a) {return a !== undefined; });
    var callback = this.extractCallback(args);
    var payload = this.toPayload(args);

    if (!callback) {
        return web3.eth.sendTransaction(payload);
    }

    web3.eth.sendTransaction(payload, callback);
};

/**
 * Should be used to estimateGas of solidity function
 *
 * @method estimateGas
 * @param {Object} options
 */
SolidityFunction.prototype.estimateGas = function () {
    var args = Array.prototype.slice.call(arguments);
    var callback = this.extractCallback(args);
    var payload = this.toPayload(args);

    if (!callback) {
        return web3.eth.estimateGas(payload);
    }

    web3.eth.estimateGas(payload, callback);
};

/**
 * Should be used to get function display name
 *
 * @method displayName
 * @return {String} display name of the function
 */
SolidityFunction.prototype.displayName = function () {
    return utils.extractDisplayName(this._name);
};

/**
 * Should be used to get function type name
 *
 * @method typeName
 * @return {String} type name of the function
 */
SolidityFunction.prototype.typeName = function () {
    return utils.extractTypeName(this._name);
};

/**
 * Should be called to get rpc requests from solidity function
 *
 * @method request
 * @returns {Object}
 */
SolidityFunction.prototype.request = function () {
    var args = Array.prototype.slice.call(arguments);
    var callback = this.extractCallback(args);
    var payload = this.toPayload(args);
    var format = this.unpackOutput.bind(this);
    
    return {
        callback: callback,
        payload: payload, 
        format: format
    };
};

/**
 * Should be called to execute function
 *
 * @method execute
 */
SolidityFunction.prototype.execute = function () {
    var transaction = !this._constant;

    // send transaction
    if (transaction) {
        return this.sendTransaction.apply(this, Array.prototype.slice.call(arguments));
    }

    // call
    return this.call.apply(this, Array.prototype.slice.call(arguments));
};

/**
 * Should be called to attach function to contract
 *
 * @method attachToContract
 * @param {Contract}
 */
SolidityFunction.prototype.attachToContract = function (contract) {
    var execute = this.execute.bind(this);
    execute.request = this.request.bind(this);
    execute.call = this.call.bind(this);
    execute.sendTransaction = this.sendTransaction.bind(this);
    execute.estimateGas = this.estimateGas.bind(this);
    var displayName = this.displayName();
    if (!contract[displayName]) {
        contract[displayName] = execute;
    }
    contract[displayName][this.typeName()] = execute; // circular!!!!
};

module.exports = SolidityFunction;


},{"../solidity/coder":1,"../utils/sha3":6,"../utils/utils":7,"../web3":9}],19:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file httpprovider.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 *   Marian Oancea <marian@ethdev.com>
 *   Fabian Vogelsteller <fabian@ethdev.com>
 * @date 2014
 */

"use strict";

var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest; // jshint ignore:line
var errors = require('./errors');

var HttpProvider = function (host) {
    this.host = host || 'http://localhost:8545';
};

HttpProvider.prototype.send = function (payload) {
    var request = new XMLHttpRequest();

    request.open('POST', this.host, false);
    
    try {
        request.send(JSON.stringify(payload));
    } catch(error) {
        throw errors.InvalidConnection(this.host);
    }


    // check request.status
    // TODO: throw an error here! it cannot silently fail!!!
    //if (request.status !== 200) {
        //return;
    //}

    var result = request.responseText;

    try {
        result = JSON.parse(result);
    } catch(e) {
        throw errors.InvalidResponse(result);                
    }

    return result;
};

HttpProvider.prototype.sendAsync = function (payload, callback) {
    var request = new XMLHttpRequest();
    request.onreadystatechange = function() {
        if (request.readyState === 4) {
            var result = request.responseText;
            var error = null;

            try {
                result = JSON.parse(result);
            } catch(e) {
                error = errors.InvalidResponse(result);                
            }

            callback(error, result);
        }
    };

    request.open('POST', this.host, true);

    try {
        request.send(JSON.stringify(payload));
    } catch(error) {
        callback(errors.InvalidConnection(this.host));
    }
};

module.exports = HttpProvider;


},{"./errors":13,"xmlhttprequest":4}],20:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file icap.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var utils = require('../utils/utils');

/**
 * This prototype should be used to extract necessary information from iban address
 *
 * @param {String} iban
 */
var ICAP = function (iban) {
    this._iban = iban;
};

/**
 * Should be called to check if icap is correct
 *
 * @method isValid
 * @returns {Boolean} true if it is, otherwise false
 */
ICAP.prototype.isValid = function () {
    return utils.isIBAN(this._iban);
};

/**
 * Should be called to check if iban number is direct
 *
 * @method isDirect
 * @returns {Boolean} true if it is, otherwise false
 */
ICAP.prototype.isDirect = function () {
    return this._iban.length === 34;
};

/**
 * Should be called to check if iban number if indirect
 *
 * @method isIndirect
 * @returns {Boolean} true if it is, otherwise false
 */
ICAP.prototype.isIndirect = function () {
    return this._iban.length === 20;
};

/**
 * Should be called to get iban checksum
 * Uses the mod-97-10 checksumming protocol (ISO/IEC 7064:2003)
 *
 * @method checksum
 * @returns {String} checksum
 */
ICAP.prototype.checksum = function () {
    return this._iban.substr(2, 2);
};

/**
 * Should be called to get institution identifier
 * eg. XREG
 *
 * @method institution
 * @returns {String} institution identifier
 */
ICAP.prototype.institution = function () {
    return this.isIndirect() ? this._iban.substr(7, 4) : '';
};

/**
 * Should be called to get client identifier within institution
 * eg. GAVOFYORK
 *
 * @method client
 * @returns {String} client identifier
 */
ICAP.prototype.client = function () {
    return this.isIndirect() ? this._iban.substr(11) : '';
};

/**
 * Should be called to get client direct address
 *
 * @method address
 * @returns {String} client direct address
 */
ICAP.prototype.address = function () {
    return this.isDirect() ? this._iban.substr(4) : '';
};

module.exports = ICAP;


},{"../utils/utils":7}],21:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file jsonrpc.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var Jsonrpc = function () {
    // singleton pattern
    if (arguments.callee._singletonInstance) {
        return arguments.callee._singletonInstance;
    }
    arguments.callee._singletonInstance = this;

    this.messageId = 1;
};

/**
 * @return {Jsonrpc} singleton
 */
Jsonrpc.getInstance = function () {
    var instance = new Jsonrpc();
    return instance;
};

/**
 * Should be called to valid json create payload object
 *
 * @method toPayload
 * @param {Function} method of jsonrpc call, required
 * @param {Array} params, an array of method params, optional
 * @returns {Object} valid jsonrpc payload object
 */
Jsonrpc.prototype.toPayload = function (method, params) {
    if (!method)
        console.error('jsonrpc method should be specified!');

    return {
        jsonrpc: '2.0',
        method: method,
        params: params || [],
        id: this.messageId++
    };
};

/**
 * Should be called to check if jsonrpc response is valid
 *
 * @method isValidResponse
 * @param {Object}
 * @returns {Boolean} true if response is valid, otherwise false
 */
Jsonrpc.prototype.isValidResponse = function (response) {
    return !!response &&
        !response.error &&
        response.jsonrpc === '2.0' &&
        typeof response.id === 'number' &&
        response.result !== undefined; // only undefined is not valid json object
};

/**
 * Should be called to create batch payload object
 *
 * @method toBatchPayload
 * @param {Array} messages, an array of objects with method (required) and params (optional) fields
 * @returns {Array} batch payload
 */
Jsonrpc.prototype.toBatchPayload = function (messages) {
    var self = this;
    return messages.map(function (message) {
        return self.toPayload(message.method, message.params);
    });
};

module.exports = Jsonrpc;


},{}],22:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @file method.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var RequestManager = require('./requestmanager');
var utils = require('../utils/utils');
var errors = require('./errors');

var Method = function (options) {
    this.name = options.name;
    this.call = options.call;
    this.params = options.params || 0;
    this.inputFormatter = options.inputFormatter;
    this.outputFormatter = options.outputFormatter;
};

/**
 * Should be used to determine name of the jsonrpc method based on arguments
 *
 * @method getCall
 * @param {Array} arguments
 * @return {String} name of jsonrpc method
 */
Method.prototype.getCall = function (args) {
    return utils.isFunction(this.call) ? this.call(args) : this.call;
};

/**
 * Should be used to extract callback from array of arguments. Modifies input param
 *
 * @method extractCallback
 * @param {Array} arguments
 * @return {Function|Null} callback, if exists
 */
Method.prototype.extractCallback = function (args) {
    if (utils.isFunction(args[args.length - 1])) {
        return args.pop(); // modify the args array!
    }
};

/**
 * Should be called to check if the number of arguments is correct
 * 
 * @method validateArgs
 * @param {Array} arguments
 * @throws {Error} if it is not
 */
Method.prototype.validateArgs = function (args) {
    if (args.length !== this.params) {
        throw errors.InvalidNumberOfParams();
    }
};

/**
 * Should be called to format input args of method
 * 
 * @method formatInput
 * @param {Array}
 * @return {Array}
 */
Method.prototype.formatInput = function (args) {
    if (!this.inputFormatter) {
        return args;
    }

    return this.inputFormatter.map(function (formatter, index) {
        return formatter ? formatter(args[index]) : args[index];
    });
};

/**
 * Should be called to format output(result) of method
 *
 * @method formatOutput
 * @param {Object}
 * @return {Object}
 */
Method.prototype.formatOutput = function (result) {
    return this.outputFormatter && result !== null ? this.outputFormatter(result) : result;
};

/**
 * Should attach function to method
 * 
 * @method attachToObject
 * @param {Object}
 * @param {Function}
 */
Method.prototype.attachToObject = function (obj) {
    var func = this.send.bind(this);
    func.request = this.request.bind(this);
    func.call = this.call; // that's ugly. filter.js uses it
    var name = this.name.split('.');
    if (name.length > 1) {
        obj[name[0]] = obj[name[0]] || {};
        obj[name[0]][name[1]] = func;
    } else {
        obj[name[0]] = func; 
    }
};

/**
 * Should create payload from given input args
 *
 * @method toPayload
 * @param {Array} args
 * @return {Object}
 */
Method.prototype.toPayload = function (args) {
    var call = this.getCall(args);
    var callback = this.extractCallback(args);
    var params = this.formatInput(args);
    this.validateArgs(params);

    return {
        method: call,
        params: params,
        callback: callback
    };
};

/**
 * Should be called to create pure JSONRPC request which can be used in batch request
 *
 * @method request
 * @param {...} params
 * @return {Object} jsonrpc request
 */
Method.prototype.request = function () {
    var payload = this.toPayload(Array.prototype.slice.call(arguments));
    payload.format = this.formatOutput.bind(this);
    return payload;
};

/**
 * Should send request to the API
 *
 * @method send
 * @param list of params
 * @return result
 */
Method.prototype.send = function () {
    var payload = this.toPayload(Array.prototype.slice.call(arguments));
    if (payload.callback) {
        var self = this;
        return RequestManager.getInstance().sendAsync(payload, function (err, result) {
            payload.callback(err, self.formatOutput(result));
        });
    }
    return this.formatOutput(RequestManager.getInstance().send(payload));
};

module.exports = Method;


},{"../utils/utils":7,"./errors":13,"./requestmanager":27}],23:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file namereg.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var contract = require('./contract');

var address = '0xc6d9d2cd449a754c494264e1809c50e34d64562b';

var abi = [
    {"constant":true,"inputs":[{"name":"_owner","type":"address"}],"name":"name","outputs":[{"name":"o_name","type":"bytes32"}],"type":"function"},
    {"constant":true,"inputs":[{"name":"_name","type":"bytes32"}],"name":"owner","outputs":[{"name":"","type":"address"}],"type":"function"},
    {"constant":true,"inputs":[{"name":"_name","type":"bytes32"}],"name":"content","outputs":[{"name":"","type":"bytes32"}],"type":"function"},
    {"constant":true,"inputs":[{"name":"_name","type":"bytes32"}],"name":"addr","outputs":[{"name":"","type":"address"}],"type":"function"},
    {"constant":false,"inputs":[{"name":"_name","type":"bytes32"}],"name":"reserve","outputs":[],"type":"function"},
    {"constant":true,"inputs":[{"name":"_name","type":"bytes32"}],"name":"subRegistrar","outputs":[{"name":"o_subRegistrar","type":"address"}],"type":"function"},
    {"constant":false,"inputs":[{"name":"_name","type":"bytes32"},{"name":"_newOwner","type":"address"}],"name":"transfer","outputs":[],"type":"function"},
    {"constant":false,"inputs":[{"name":"_name","type":"bytes32"},{"name":"_registrar","type":"address"}],"name":"setSubRegistrar","outputs":[],"type":"function"},
    {"constant":false,"inputs":[],"name":"Registrar","outputs":[],"type":"function"},
    {"constant":false,"inputs":[{"name":"_name","type":"bytes32"},{"name":"_a","type":"address"},{"name":"_primary","type":"bool"}],"name":"setAddress","outputs":[],"type":"function"},
    {"constant":false,"inputs":[{"name":"_name","type":"bytes32"},{"name":"_content","type":"bytes32"}],"name":"setContent","outputs":[],"type":"function"},
    {"constant":false,"inputs":[{"name":"_name","type":"bytes32"}],"name":"disown","outputs":[],"type":"function"},
    {"constant":true,"inputs":[{"name":"_name","type":"bytes32"}],"name":"register","outputs":[{"name":"","type":"address"}],"type":"function"},
    {"anonymous":false,"inputs":[{"indexed":true,"name":"name","type":"bytes32"}],"name":"Changed","type":"event"},
    {"anonymous":false,"inputs":[{"indexed":true,"name":"name","type":"bytes32"},{"indexed":true,"name":"addr","type":"address"}],"name":"PrimaryChanged","type":"event"}
];

module.exports = contract(abi).at(address);


},{"./contract":11}],24:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file eth.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var utils = require('../utils/utils');
var Property = require('./property');

/// @returns an array of objects describing web3.eth api methods
var methods = [
];

/// @returns an array of objects describing web3.eth api properties
var properties = [
    new Property({
        name: 'listening',
        getter: 'net_listening'
    }),
    new Property({
        name: 'peerCount',
        getter: 'net_peerCount',
        outputFormatter: utils.toDecimal
    })
];


module.exports = {
    methods: methods,
    properties: properties
};


},{"../utils/utils":7,"./property":25}],25:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/**
 * @file property.js
 * @author Fabian Vogelsteller <fabian@frozeman.de>
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var RequestManager = require('./requestmanager');

var Property = function (options) {
    this.name = options.name;
    this.getter = options.getter;
    this.setter = options.setter;
    this.outputFormatter = options.outputFormatter;
    this.inputFormatter = options.inputFormatter;
};

/**
 * Should be called to format input args of method
 * 
 * @method formatInput
 * @param {Array}
 * @return {Array}
 */
Property.prototype.formatInput = function (arg) {
    return this.inputFormatter ? this.inputFormatter(arg) : arg;
};

/**
 * Should be called to format output(result) of method
 *
 * @method formatOutput
 * @param {Object}
 * @return {Object}
 */
Property.prototype.formatOutput = function (result) {
    return this.outputFormatter && result !== null ? this.outputFormatter(result) : result;
};

/**
 * Should attach function to method
 * 
 * @method attachToObject
 * @param {Object}
 * @param {Function}
 */
Property.prototype.attachToObject = function (obj) {
    var proto = {
        get: this.get.bind(this),
    };

    var names = this.name.split('.');
    var name = names[0];
    if (names.length > 1) {
        obj[names[0]] = obj[names[0]] || {};
        obj = obj[names[0]];
        name = names[1];
    }
    
    Object.defineProperty(obj, name, proto);

    var toAsyncName = function (prefix, name) {
        return prefix + name.charAt(0).toUpperCase() + name.slice(1);
    };

    obj[toAsyncName('get', name)] = this.getAsync.bind(this);
};

/**
 * Should be used to get value of the property
 *
 * @method get
 * @return {Object} value of the property
 */
Property.prototype.get = function () {
    return this.formatOutput(RequestManager.getInstance().send({
        method: this.getter
    }));
};

/**
 * Should be used to asynchrounously get value of property
 *
 * @method getAsync
 * @param {Function}
 */
Property.prototype.getAsync = function (callback) {
    var self = this;
    RequestManager.getInstance().sendAsync({
        method: this.getter
    }, function (err, result) {
        if (err) {
            return callback(err);
        }
        callback(err, self.formatOutput(result));
    });
};

module.exports = Property;


},{"./requestmanager":27}],26:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file qtsync.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 *   Marian Oancea <marian@ethdev.com>
 * @date 2014
 */

var QtSyncProvider = function () {
};

QtSyncProvider.prototype.send = function (payload) {
    var result = navigator.qt.callMethod(JSON.stringify(payload));
    return JSON.parse(result);
};

module.exports = QtSyncProvider;


},{}],27:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file requestmanager.js
 * @author Jeffrey Wilcke <jeff@ethdev.com>
 * @author Marek Kotewicz <marek@ethdev.com>
 * @author Marian Oancea <marian@ethdev.com>
 * @author Fabian Vogelsteller <fabian@ethdev.com>
 * @author Gav Wood <g@ethdev.com>
 * @date 2014
 */

var Jsonrpc = require('./jsonrpc');
var utils = require('../utils/utils');
var c = require('../utils/config');
var errors = require('./errors');

/**
 * It's responsible for passing messages to providers
 * It's also responsible for polling the ethereum node for incoming messages
 * Default poll timeout is 1 second
 * Singleton
 */
var RequestManager = function (provider) {
    // singleton pattern
    if (arguments.callee._singletonInstance) {
        return arguments.callee._singletonInstance;
    }
    arguments.callee._singletonInstance = this;

    this.provider = provider;
    this.polls = [];
    this.timeout = null;
    this.poll();
};

/**
 * @return {RequestManager} singleton
 */
RequestManager.getInstance = function () {
    var instance = new RequestManager();
    return instance;
};

/**
 * Should be used to synchronously send request
 *
 * @method send
 * @param {Object} data
 * @return {Object}
 */
RequestManager.prototype.send = function (data) {
    if (!this.provider) {
        console.error(errors.InvalidProvider());
        return null;
    }

    var payload = Jsonrpc.getInstance().toPayload(data.method, data.params);
    var result = this.provider.send(payload);

    if (!Jsonrpc.getInstance().isValidResponse(result)) {
        throw errors.InvalidResponse(result);
    }

    return result.result;
};

/**
 * Should be used to asynchronously send request
 *
 * @method sendAsync
 * @param {Object} data
 * @param {Function} callback
 */
RequestManager.prototype.sendAsync = function (data, callback) {
    if (!this.provider) {
        return callback(errors.InvalidProvider());
    }

    var payload = Jsonrpc.getInstance().toPayload(data.method, data.params);
    this.provider.sendAsync(payload, function (err, result) {
        if (err) {
            return callback(err);
        }
        
        if (!Jsonrpc.getInstance().isValidResponse(result)) {
            return callback(errors.InvalidResponse(result));
        }

        callback(null, result.result);
    });
};

/**
 * Should be called to asynchronously send batch request
 *
 * @method sendBatch
 * @param {Array} batch data
 * @param {Function} callback
 */
RequestManager.prototype.sendBatch = function (data, callback) {
    if (!this.provider) {
        return callback(errors.InvalidProvider());
    }

    var payload = Jsonrpc.getInstance().toBatchPayload(data);

    this.provider.sendAsync(payload, function (err, results) {
        if (err) {
            return callback(err);
        }

        if (!utils.isArray(results)) {
            return callback(errors.InvalidResponse(results));
        }

        callback(err, results);
    }); 
};

/**
 * Should be used to set provider of request manager
 *
 * @method setProvider
 * @param {Object}
 */
RequestManager.prototype.setProvider = function (p) {
    this.provider = p;
};

/*jshint maxparams:4 */

/**
 * Should be used to start polling
 *
 * @method startPolling
 * @param {Object} data
 * @param {Number} pollId
 * @param {Function} callback
 * @param {Function} uninstall
 *
 * @todo cleanup number of params
 */
RequestManager.prototype.startPolling = function (data, pollId, callback, uninstall) {
    this.polls.push({data: data, id: pollId, callback: callback, uninstall: uninstall});
};
/*jshint maxparams:3 */

/**
 * Should be used to stop polling for filter with given id
 *
 * @method stopPolling
 * @param {Number} pollId
 */
RequestManager.prototype.stopPolling = function (pollId) {
    for (var i = this.polls.length; i--;) {
        var poll = this.polls[i];
        if (poll.id === pollId) {
            this.polls.splice(i, 1);
        }
    }
};

/**
 * Should be called to reset polling mechanism of request manager
 *
 * @method reset
 */
RequestManager.prototype.reset = function () {
    this.polls.forEach(function (poll) {
        poll.uninstall(poll.id); 
    });
    this.polls = [];

    if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
    }
    this.poll();
};

/**
 * Should be called to poll for changes on filter with given id
 *
 * @method poll
 */
RequestManager.prototype.poll = function () {
    this.timeout = setTimeout(this.poll.bind(this), c.ETH_POLLING_TIMEOUT);

    if (!this.polls.length) {
        return;
    }

    if (!this.provider) {
        console.error(errors.InvalidProvider());
        return;
    }

    var payload = Jsonrpc.getInstance().toBatchPayload(this.polls.map(function (data) {
        return data.data;
    }));

    var self = this;
    this.provider.sendAsync(payload, function (error, results) {
        // TODO: console log?
        if (error) {
            return;
        }
            
        if (!utils.isArray(results)) {
            throw errors.InvalidResponse(results);
        }

        results.map(function (result, index) {
            result.callback = self.polls[index].callback;
            return result;
        }).filter(function (result) {
            var valid = Jsonrpc.getInstance().isValidResponse(result);
            if (!valid) {
                result.callback(errors.InvalidResponse(result));
            }
            return valid;
        }).filter(function (result) {
            return utils.isArray(result.result) && result.result.length > 0;
        }).forEach(function (result) {
            result.callback(null, result.result);
        });
    });
};

module.exports = RequestManager;


},{"../utils/config":5,"../utils/utils":7,"./errors":13,"./jsonrpc":21}],28:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file shh.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var Method = require('./method');
var formatters = require('./formatters');

var post = new Method({
    name: 'post', 
    call: 'shh_post', 
    params: 1,
    inputFormatter: [formatters.inputPostFormatter]
});

var newIdentity = new Method({
    name: 'newIdentity',
    call: 'shh_newIdentity',
    params: 0
});

var hasIdentity = new Method({
    name: 'hasIdentity',
    call: 'shh_hasIdentity',
    params: 1
});

var newGroup = new Method({
    name: 'newGroup',
    call: 'shh_newGroup',
    params: 0
});

var addToGroup = new Method({
    name: 'addToGroup',
    call: 'shh_addToGroup',
    params: 0
});

var methods = [
    post,
    newIdentity,
    hasIdentity,
    newGroup,
    addToGroup
];

module.exports = {
    methods: methods
};


},{"./formatters":17,"./method":22}],29:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** 
 * @file transfer.js
 * @author Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var web3 = require('../web3');
var ICAP = require('./icap');
var namereg = require('./namereg');
var contract = require('./contract');

/**
 * Should be used to make ICAP transfer
 *
 * @method transfer
 * @param {String} iban number
 * @param {String} from (address)
 * @param {Value} value to be tranfered
 * @param {Function} callback, callback
 */
var transfer = function (from, iban, value, callback) {
    var icap = new ICAP(iban); 
    if (!icap.isValid()) {
        throw new Error('invalid iban address');
    }

    if (icap.isDirect()) {
        return transferToAddress(from, icap.address(), value, callback);
    }
    
    if (!callback) {
        var address = namereg.addr(icap.institution());
        return deposit(from, address, value, icap.client());
    }

    namereg.addr(icap.insitution(), function (err, address) {
        return deposit(from, address, value, icap.client(), callback);
    });
    
};

/**
 * Should be used to transfer funds to certain address
 *
 * @method transferToAddress
 * @param {String} address
 * @param {String} from (address)
 * @param {Value} value to be tranfered
 * @param {Function} callback, callback
 */
var transferToAddress = function (from, address, value, callback) {
    return web3.eth.sendTransaction({
        address: address,
        from: from,
        value: value
    }, callback);
};

/**
 * Should be used to deposit funds to generic Exchange contract (must implement deposit(bytes32) method!)
 *
 * @method deposit
 * @param {String} address
 * @param {String} from (address)
 * @param {Value} value to be tranfered
 * @param {String} client unique identifier
 * @param {Function} callback, callback
 */
var deposit = function (from, address, value, client, callback) {
    var abi = [{"constant":false,"inputs":[{"name":"name","type":"bytes32"}],"name":"deposit","outputs":[],"type":"function"}];
    return contract(abi).at(address).deposit(client, {
        from: from,
        value: value
    }, callback);
};

module.exports = transfer;


},{"../web3":9,"./contract":11,"./icap":20,"./namereg":23}],30:[function(require,module,exports){
/*
    This file is part of ethereum.js.

    ethereum.js is free software: you can redistribute it and/or modify
    it under the terms of the GNU Lesser General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    ethereum.js is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Lesser General Public License for more details.

    You should have received a copy of the GNU Lesser General Public License
    along with ethereum.js.  If not, see <http://www.gnu.org/licenses/>.
*/
/** @file watches.js
 * @authors:
 *   Marek Kotewicz <marek@ethdev.com>
 * @date 2015
 */

var Method = require('./method');

/// @returns an array of objects describing web3.eth.filter api methods
var eth = function () {
    var newFilterCall = function (args) {
        var type = args[0];

        switch(type) {
            case 'latest':
                args.pop();
                this.params = 0;
                return 'eth_newBlockFilter';
            case 'pending':
                args.pop();
                this.params = 0;
                return 'eth_newPendingTransactionFilter';
            default:
                return 'eth_newFilter';
        }
    };

    var newFilter = new Method({
        name: 'newFilter',
        call: newFilterCall,
        params: 1
    });

    var uninstallFilter = new Method({
        name: 'uninstallFilter',
        call: 'eth_uninstallFilter',
        params: 1
    });

    var getLogs = new Method({
        name: 'getLogs',
        call: 'eth_getFilterLogs',
        params: 1
    });

    var poll = new Method({
        name: 'poll',
        call: 'eth_getFilterChanges',
        params: 1
    });

    return [
        newFilter,
        uninstallFilter,
        getLogs,
        poll
    ];
};

/// @returns an array of objects describing web3.shh.watch api methods
var shh = function () {
    var newFilter = new Method({
        name: 'newFilter',
        call: 'shh_newFilter',
        params: 1
    });

    var uninstallFilter = new Method({
        name: 'uninstallFilter',
        call: 'shh_uninstallFilter',
        params: 1
    });

    var getLogs = new Method({
        name: 'getLogs',
        call: 'shh_getMessages',
        params: 1
    });

    var poll = new Method({
        name: 'poll',
        call: 'shh_getFilterChanges',
        params: 1
    });

    return [
        newFilter,
        uninstallFilter,
        getLogs,
        poll
    ];
};

module.exports = {
    eth: eth,
    shh: shh
};


},{"./method":22}],31:[function(require,module,exports){

},{}],32:[function(require,module,exports){
;(function (root, factory) {
	if (typeof exports === "object") {
		// CommonJS
		module.exports = exports = factory();
	}
	else if (typeof define === "function" && define.amd) {
		// AMD
		define([], factory);
	}
	else {
		// Global (browser)
		root.CryptoJS = factory();
	}
}(this, function () {

	/**
	 * CryptoJS core components.
	 */
	var CryptoJS = CryptoJS || (function (Math, undefined) {
	    /**
	     * CryptoJS namespace.
	     */
	    var C = {};

	    /**
	     * Library namespace.
	     */
	    var C_lib = C.lib = {};

	    /**
	     * Base object for prototypal inheritance.
	     */
	    var Base = C_lib.Base = (function () {
	        function F() {}

	        return {
	            /**
	             * Creates a new object that inherits from this object.
	             *
	             * @param {Object} overrides Properties to copy into the new object.
	             *
	             * @return {Object} The new object.
	             *
	             * @static
	             *
	             * @example
	             *
	             *     var MyType = CryptoJS.lib.Base.extend({
	             *         field: 'value',
	             *
	             *         method: function () {
	             *         }
	             *     });
	             */
	            extend: function (overrides) {
	                // Spawn
	                F.prototype = this;
	                var subtype = new F();

	                // Augment
	                if (overrides) {
	                    subtype.mixIn(overrides);
	                }

	                // Create default initializer
	                if (!subtype.hasOwnProperty('init')) {
	                    subtype.init = function () {
	                        subtype.$super.init.apply(this, arguments);
	                    };
	                }

	                // Initializer's prototype is the subtype object
	                subtype.init.prototype = subtype;

	                // Reference supertype
	                subtype.$super = this;

	                return subtype;
	            },

	            /**
	             * Extends this object and runs the init method.
	             * Arguments to create() will be passed to init().
	             *
	             * @return {Object} The new object.
	             *
	             * @static
	             *
	             * @example
	             *
	             *     var instance = MyType.create();
	             */
	            create: function () {
	                var instance = this.extend();
	                instance.init.apply(instance, arguments);

	                return instance;
	            },

	            /**
	             * Initializes a newly created object.
	             * Override this method to add some logic when your objects are created.
	             *
	             * @example
	             *
	             *     var MyType = CryptoJS.lib.Base.extend({
	             *         init: function () {
	             *             // ...
	             *         }
	             *     });
	             */
	            init: function () {
	            },

	            /**
	             * Copies properties into this object.
	             *
	             * @param {Object} properties The properties to mix in.
	             *
	             * @example
	             *
	             *     MyType.mixIn({
	             *         field: 'value'
	             *     });
	             */
	            mixIn: function (properties) {
	                for (var propertyName in properties) {
	                    if (properties.hasOwnProperty(propertyName)) {
	                        this[propertyName] = properties[propertyName];
	                    }
	                }

	                // IE won't copy toString using the loop above
	                if (properties.hasOwnProperty('toString')) {
	                    this.toString = properties.toString;
	                }
	            },

	            /**
	             * Creates a copy of this object.
	             *
	             * @return {Object} The clone.
	             *
	             * @example
	             *
	             *     var clone = instance.clone();
	             */
	            clone: function () {
	                return this.init.prototype.extend(this);
	            }
	        };
	    }());

	    /**
	     * An array of 32-bit words.
	     *
	     * @property {Array} words The array of 32-bit words.
	     * @property {number} sigBytes The number of significant bytes in this word array.
	     */
	    var WordArray = C_lib.WordArray = Base.extend({
	        /**
	         * Initializes a newly created word array.
	         *
	         * @param {Array} words (Optional) An array of 32-bit words.
	         * @param {number} sigBytes (Optional) The number of significant bytes in the words.
	         *
	         * @example
	         *
	         *     var wordArray = CryptoJS.lib.WordArray.create();
	         *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607]);
	         *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607], 6);
	         */
	        init: function (words, sigBytes) {
	            words = this.words = words || [];

	            if (sigBytes != undefined) {
	                this.sigBytes = sigBytes;
	            } else {
	                this.sigBytes = words.length * 4;
	            }
	        },

	        /**
	         * Converts this word array to a string.
	         *
	         * @param {Encoder} encoder (Optional) The encoding strategy to use. Default: CryptoJS.enc.Hex
	         *
	         * @return {string} The stringified word array.
	         *
	         * @example
	         *
	         *     var string = wordArray + '';
	         *     var string = wordArray.toString();
	         *     var string = wordArray.toString(CryptoJS.enc.Utf8);
	         */
	        toString: function (encoder) {
	            return (encoder || Hex).stringify(this);
	        },

	        /**
	         * Concatenates a word array to this word array.
	         *
	         * @param {WordArray} wordArray The word array to append.
	         *
	         * @return {WordArray} This word array.
	         *
	         * @example
	         *
	         *     wordArray1.concat(wordArray2);
	         */
	        concat: function (wordArray) {
	            // Shortcuts
	            var thisWords = this.words;
	            var thatWords = wordArray.words;
	            var thisSigBytes = this.sigBytes;
	            var thatSigBytes = wordArray.sigBytes;

	            // Clamp excess bits
	            this.clamp();

	            // Concat
	            if (thisSigBytes % 4) {
	                // Copy one byte at a time
	                for (var i = 0; i < thatSigBytes; i++) {
	                    var thatByte = (thatWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
	                    thisWords[(thisSigBytes + i) >>> 2] |= thatByte << (24 - ((thisSigBytes + i) % 4) * 8);
	                }
	            } else {
	                // Copy one word at a time
	                for (var i = 0; i < thatSigBytes; i += 4) {
	                    thisWords[(thisSigBytes + i) >>> 2] = thatWords[i >>> 2];
	                }
	            }
	            this.sigBytes += thatSigBytes;

	            // Chainable
	            return this;
	        },

	        /**
	         * Removes insignificant bits.
	         *
	         * @example
	         *
	         *     wordArray.clamp();
	         */
	        clamp: function () {
	            // Shortcuts
	            var words = this.words;
	            var sigBytes = this.sigBytes;

	            // Clamp
	            words[sigBytes >>> 2] &= 0xffffffff << (32 - (sigBytes % 4) * 8);
	            words.length = Math.ceil(sigBytes / 4);
	        },

	        /**
	         * Creates a copy of this word array.
	         *
	         * @return {WordArray} The clone.
	         *
	         * @example
	         *
	         *     var clone = wordArray.clone();
	         */
	        clone: function () {
	            var clone = Base.clone.call(this);
	            clone.words = this.words.slice(0);

	            return clone;
	        },

	        /**
	         * Creates a word array filled with random bytes.
	         *
	         * @param {number} nBytes The number of random bytes to generate.
	         *
	         * @return {WordArray} The random word array.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var wordArray = CryptoJS.lib.WordArray.random(16);
	         */
	        random: function (nBytes) {
	            var words = [];

	            var r = (function (m_w) {
	                var m_w = m_w;
	                var m_z = 0x3ade68b1;
	                var mask = 0xffffffff;

	                return function () {
	                    m_z = (0x9069 * (m_z & 0xFFFF) + (m_z >> 0x10)) & mask;
	                    m_w = (0x4650 * (m_w & 0xFFFF) + (m_w >> 0x10)) & mask;
	                    var result = ((m_z << 0x10) + m_w) & mask;
	                    result /= 0x100000000;
	                    result += 0.5;
	                    return result * (Math.random() > .5 ? 1 : -1);
	                }
	            });

	            for (var i = 0, rcache; i < nBytes; i += 4) {
	                var _r = r((rcache || Math.random()) * 0x100000000);

	                rcache = _r() * 0x3ade67b7;
	                words.push((_r() * 0x100000000) | 0);
	            }

	            return new WordArray.init(words, nBytes);
	        }
	    });

	    /**
	     * Encoder namespace.
	     */
	    var C_enc = C.enc = {};

	    /**
	     * Hex encoding strategy.
	     */
	    var Hex = C_enc.Hex = {
	        /**
	         * Converts a word array to a hex string.
	         *
	         * @param {WordArray} wordArray The word array.
	         *
	         * @return {string} The hex string.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var hexString = CryptoJS.enc.Hex.stringify(wordArray);
	         */
	        stringify: function (wordArray) {
	            // Shortcuts
	            var words = wordArray.words;
	            var sigBytes = wordArray.sigBytes;

	            // Convert
	            var hexChars = [];
	            for (var i = 0; i < sigBytes; i++) {
	                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
	                hexChars.push((bite >>> 4).toString(16));
	                hexChars.push((bite & 0x0f).toString(16));
	            }

	            return hexChars.join('');
	        },

	        /**
	         * Converts a hex string to a word array.
	         *
	         * @param {string} hexStr The hex string.
	         *
	         * @return {WordArray} The word array.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var wordArray = CryptoJS.enc.Hex.parse(hexString);
	         */
	        parse: function (hexStr) {
	            // Shortcut
	            var hexStrLength = hexStr.length;

	            // Convert
	            var words = [];
	            for (var i = 0; i < hexStrLength; i += 2) {
	                words[i >>> 3] |= parseInt(hexStr.substr(i, 2), 16) << (24 - (i % 8) * 4);
	            }

	            return new WordArray.init(words, hexStrLength / 2);
	        }
	    };

	    /**
	     * Latin1 encoding strategy.
	     */
	    var Latin1 = C_enc.Latin1 = {
	        /**
	         * Converts a word array to a Latin1 string.
	         *
	         * @param {WordArray} wordArray The word array.
	         *
	         * @return {string} The Latin1 string.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var latin1String = CryptoJS.enc.Latin1.stringify(wordArray);
	         */
	        stringify: function (wordArray) {
	            // Shortcuts
	            var words = wordArray.words;
	            var sigBytes = wordArray.sigBytes;

	            // Convert
	            var latin1Chars = [];
	            for (var i = 0; i < sigBytes; i++) {
	                var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
	                latin1Chars.push(String.fromCharCode(bite));
	            }

	            return latin1Chars.join('');
	        },

	        /**
	         * Converts a Latin1 string to a word array.
	         *
	         * @param {string} latin1Str The Latin1 string.
	         *
	         * @return {WordArray} The word array.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var wordArray = CryptoJS.enc.Latin1.parse(latin1String);
	         */
	        parse: function (latin1Str) {
	            // Shortcut
	            var latin1StrLength = latin1Str.length;

	            // Convert
	            var words = [];
	            for (var i = 0; i < latin1StrLength; i++) {
	                words[i >>> 2] |= (latin1Str.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
	            }

	            return new WordArray.init(words, latin1StrLength);
	        }
	    };

	    /**
	     * UTF-8 encoding strategy.
	     */
	    var Utf8 = C_enc.Utf8 = {
	        /**
	         * Converts a word array to a UTF-8 string.
	         *
	         * @param {WordArray} wordArray The word array.
	         *
	         * @return {string} The UTF-8 string.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var utf8String = CryptoJS.enc.Utf8.stringify(wordArray);
	         */
	        stringify: function (wordArray) {
	            try {
	                return decodeURIComponent(escape(Latin1.stringify(wordArray)));
	            } catch (e) {
	                throw new Error('Malformed UTF-8 data');
	            }
	        },

	        /**
	         * Converts a UTF-8 string to a word array.
	         *
	         * @param {string} utf8Str The UTF-8 string.
	         *
	         * @return {WordArray} The word array.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var wordArray = CryptoJS.enc.Utf8.parse(utf8String);
	         */
	        parse: function (utf8Str) {
	            return Latin1.parse(unescape(encodeURIComponent(utf8Str)));
	        }
	    };

	    /**
	     * Abstract buffered block algorithm template.
	     *
	     * The property blockSize must be implemented in a concrete subtype.
	     *
	     * @property {number} _minBufferSize The number of blocks that should be kept unprocessed in the buffer. Default: 0
	     */
	    var BufferedBlockAlgorithm = C_lib.BufferedBlockAlgorithm = Base.extend({
	        /**
	         * Resets this block algorithm's data buffer to its initial state.
	         *
	         * @example
	         *
	         *     bufferedBlockAlgorithm.reset();
	         */
	        reset: function () {
	            // Initial values
	            this._data = new WordArray.init();
	            this._nDataBytes = 0;
	        },

	        /**
	         * Adds new data to this block algorithm's buffer.
	         *
	         * @param {WordArray|string} data The data to append. Strings are converted to a WordArray using UTF-8.
	         *
	         * @example
	         *
	         *     bufferedBlockAlgorithm._append('data');
	         *     bufferedBlockAlgorithm._append(wordArray);
	         */
	        _append: function (data) {
	            // Convert string to WordArray, else assume WordArray already
	            if (typeof data == 'string') {
	                data = Utf8.parse(data);
	            }

	            // Append
	            this._data.concat(data);
	            this._nDataBytes += data.sigBytes;
	        },

	        /**
	         * Processes available data blocks.
	         *
	         * This method invokes _doProcessBlock(offset), which must be implemented by a concrete subtype.
	         *
	         * @param {boolean} doFlush Whether all blocks and partial blocks should be processed.
	         *
	         * @return {WordArray} The processed data.
	         *
	         * @example
	         *
	         *     var processedData = bufferedBlockAlgorithm._process();
	         *     var processedData = bufferedBlockAlgorithm._process(!!'flush');
	         */
	        _process: function (doFlush) {
	            // Shortcuts
	            var data = this._data;
	            var dataWords = data.words;
	            var dataSigBytes = data.sigBytes;
	            var blockSize = this.blockSize;
	            var blockSizeBytes = blockSize * 4;

	            // Count blocks ready
	            var nBlocksReady = dataSigBytes / blockSizeBytes;
	            if (doFlush) {
	                // Round up to include partial blocks
	                nBlocksReady = Math.ceil(nBlocksReady);
	            } else {
	                // Round down to include only full blocks,
	                // less the number of blocks that must remain in the buffer
	                nBlocksReady = Math.max((nBlocksReady | 0) - this._minBufferSize, 0);
	            }

	            // Count words ready
	            var nWordsReady = nBlocksReady * blockSize;

	            // Count bytes ready
	            var nBytesReady = Math.min(nWordsReady * 4, dataSigBytes);

	            // Process blocks
	            if (nWordsReady) {
	                for (var offset = 0; offset < nWordsReady; offset += blockSize) {
	                    // Perform concrete-algorithm logic
	                    this._doProcessBlock(dataWords, offset);
	                }

	                // Remove processed words
	                var processedWords = dataWords.splice(0, nWordsReady);
	                data.sigBytes -= nBytesReady;
	            }

	            // Return processed words
	            return new WordArray.init(processedWords, nBytesReady);
	        },

	        /**
	         * Creates a copy of this object.
	         *
	         * @return {Object} The clone.
	         *
	         * @example
	         *
	         *     var clone = bufferedBlockAlgorithm.clone();
	         */
	        clone: function () {
	            var clone = Base.clone.call(this);
	            clone._data = this._data.clone();

	            return clone;
	        },

	        _minBufferSize: 0
	    });

	    /**
	     * Abstract hasher template.
	     *
	     * @property {number} blockSize The number of 32-bit words this hasher operates on. Default: 16 (512 bits)
	     */
	    var Hasher = C_lib.Hasher = BufferedBlockAlgorithm.extend({
	        /**
	         * Configuration options.
	         */
	        cfg: Base.extend(),

	        /**
	         * Initializes a newly created hasher.
	         *
	         * @param {Object} cfg (Optional) The configuration options to use for this hash computation.
	         *
	         * @example
	         *
	         *     var hasher = CryptoJS.algo.SHA256.create();
	         */
	        init: function (cfg) {
	            // Apply config defaults
	            this.cfg = this.cfg.extend(cfg);

	            // Set initial values
	            this.reset();
	        },

	        /**
	         * Resets this hasher to its initial state.
	         *
	         * @example
	         *
	         *     hasher.reset();
	         */
	        reset: function () {
	            // Reset data buffer
	            BufferedBlockAlgorithm.reset.call(this);

	            // Perform concrete-hasher logic
	            this._doReset();
	        },

	        /**
	         * Updates this hasher with a message.
	         *
	         * @param {WordArray|string} messageUpdate The message to append.
	         *
	         * @return {Hasher} This hasher.
	         *
	         * @example
	         *
	         *     hasher.update('message');
	         *     hasher.update(wordArray);
	         */
	        update: function (messageUpdate) {
	            // Append
	            this._append(messageUpdate);

	            // Update the hash
	            this._process();

	            // Chainable
	            return this;
	        },

	        /**
	         * Finalizes the hash computation.
	         * Note that the finalize operation is effectively a destructive, read-once operation.
	         *
	         * @param {WordArray|string} messageUpdate (Optional) A final message update.
	         *
	         * @return {WordArray} The hash.
	         *
	         * @example
	         *
	         *     var hash = hasher.finalize();
	         *     var hash = hasher.finalize('message');
	         *     var hash = hasher.finalize(wordArray);
	         */
	        finalize: function (messageUpdate) {
	            // Final message update
	            if (messageUpdate) {
	                this._append(messageUpdate);
	            }

	            // Perform concrete-hasher logic
	            var hash = this._doFinalize();

	            return hash;
	        },

	        blockSize: 512/32,

	        /**
	         * Creates a shortcut function to a hasher's object interface.
	         *
	         * @param {Hasher} hasher The hasher to create a helper for.
	         *
	         * @return {Function} The shortcut function.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var SHA256 = CryptoJS.lib.Hasher._createHelper(CryptoJS.algo.SHA256);
	         */
	        _createHelper: function (hasher) {
	            return function (message, cfg) {
	                return new hasher.init(cfg).finalize(message);
	            };
	        },

	        /**
	         * Creates a shortcut function to the HMAC's object interface.
	         *
	         * @param {Hasher} hasher The hasher to use in this HMAC helper.
	         *
	         * @return {Function} The shortcut function.
	         *
	         * @static
	         *
	         * @example
	         *
	         *     var HmacSHA256 = CryptoJS.lib.Hasher._createHmacHelper(CryptoJS.algo.SHA256);
	         */
	        _createHmacHelper: function (hasher) {
	            return function (message, key) {
	                return new C_algo.HMAC.init(hasher, key).finalize(message);
	            };
	        }
	    });

	    /**
	     * Algorithm namespace.
	     */
	    var C_algo = C.algo = {};

	    return C;
	}(Math));


	return CryptoJS;

}));
},{}],33:[function(require,module,exports){
;(function (root, factory, undef) {
	if (typeof exports === "object") {
		// CommonJS
		module.exports = exports = factory(require("./core"), require("./x64-core"));
	}
	else if (typeof define === "function" && define.amd) {
		// AMD
		define(["./core", "./x64-core"], factory);
	}
	else {
		// Global (browser)
		factory(root.CryptoJS);
	}
}(this, function (CryptoJS) {

	(function (Math) {
	    // Shortcuts
	    var C = CryptoJS;
	    var C_lib = C.lib;
	    var WordArray = C_lib.WordArray;
	    var Hasher = C_lib.Hasher;
	    var C_x64 = C.x64;
	    var X64Word = C_x64.Word;
	    var C_algo = C.algo;

	    // Constants tables
	    var RHO_OFFSETS = [];
	    var PI_INDEXES  = [];
	    var ROUND_CONSTANTS = [];

	    // Compute Constants
	    (function () {
	        // Compute rho offset constants
	        var x = 1, y = 0;
	        for (var t = 0; t < 24; t++) {
	            RHO_OFFSETS[x + 5 * y] = ((t + 1) * (t + 2) / 2) % 64;

	            var newX = y % 5;
	            var newY = (2 * x + 3 * y) % 5;
	            x = newX;
	            y = newY;
	        }

	        // Compute pi index constants
	        for (var x = 0; x < 5; x++) {
	            for (var y = 0; y < 5; y++) {
	                PI_INDEXES[x + 5 * y] = y + ((2 * x + 3 * y) % 5) * 5;
	            }
	        }

	        // Compute round constants
	        var LFSR = 0x01;
	        for (var i = 0; i < 24; i++) {
	            var roundConstantMsw = 0;
	            var roundConstantLsw = 0;

	            for (var j = 0; j < 7; j++) {
	                if (LFSR & 0x01) {
	                    var bitPosition = (1 << j) - 1;
	                    if (bitPosition < 32) {
	                        roundConstantLsw ^= 1 << bitPosition;
	                    } else /* if (bitPosition >= 32) */ {
	                        roundConstantMsw ^= 1 << (bitPosition - 32);
	                    }
	                }

	                // Compute next LFSR
	                if (LFSR & 0x80) {
	                    // Primitive polynomial over GF(2): x^8 + x^6 + x^5 + x^4 + 1
	                    LFSR = (LFSR << 1) ^ 0x71;
	                } else {
	                    LFSR <<= 1;
	                }
	            }

	            ROUND_CONSTANTS[i] = X64Word.create(roundConstantMsw, roundConstantLsw);
	        }
	    }());

	    // Reusable objects for temporary values
	    var T = [];
	    (function () {
	        for (var i = 0; i < 25; i++) {
	            T[i] = X64Word.create();
	        }
	    }());

	    /**
	     * SHA-3 hash algorithm.
	     */
	    var SHA3 = C_algo.SHA3 = Hasher.extend({
	        /**
	         * Configuration options.
	         *
	         * @property {number} outputLength
	         *   The desired number of bits in the output hash.
	         *   Only values permitted are: 224, 256, 384, 512.
	         *   Default: 512
	         */
	        cfg: Hasher.cfg.extend({
	            outputLength: 512
	        }),

	        _doReset: function () {
	            var state = this._state = []
	            for (var i = 0; i < 25; i++) {
	                state[i] = new X64Word.init();
	            }

	            this.blockSize = (1600 - 2 * this.cfg.outputLength) / 32;
	        },

	        _doProcessBlock: function (M, offset) {
	            // Shortcuts
	            var state = this._state;
	            var nBlockSizeLanes = this.blockSize / 2;

	            // Absorb
	            for (var i = 0; i < nBlockSizeLanes; i++) {
	                // Shortcuts
	                var M2i  = M[offset + 2 * i];
	                var M2i1 = M[offset + 2 * i + 1];

	                // Swap endian
	                M2i = (
	                    (((M2i << 8)  | (M2i >>> 24)) & 0x00ff00ff) |
	                    (((M2i << 24) | (M2i >>> 8))  & 0xff00ff00)
	                );
	                M2i1 = (
	                    (((M2i1 << 8)  | (M2i1 >>> 24)) & 0x00ff00ff) |
	                    (((M2i1 << 24) | (M2i1 >>> 8))  & 0xff00ff00)
	                );

	                // Absorb message into state
	                var lane = state[i];
	                lane.high ^= M2i1;
	                lane.low  ^= M2i;
	            }

	            // Rounds
	            for (var round = 0; round < 24; round++) {
	                // Theta
	                for (var x = 0; x < 5; x++) {
	                    // Mix column lanes
	                    var tMsw = 0, tLsw = 0;
	                    for (var y = 0; y < 5; y++) {
	                        var lane = state[x + 5 * y];
	                        tMsw ^= lane.high;
	                        tLsw ^= lane.low;
	                    }

	                    // Temporary values
	                    var Tx = T[x];
	                    Tx.high = tMsw;
	                    Tx.low  = tLsw;
	                }
	                for (var x = 0; x < 5; x++) {
	                    // Shortcuts
	                    var Tx4 = T[(x + 4) % 5];
	                    var Tx1 = T[(x + 1) % 5];
	                    var Tx1Msw = Tx1.high;
	                    var Tx1Lsw = Tx1.low;

	                    // Mix surrounding columns
	                    var tMsw = Tx4.high ^ ((Tx1Msw << 1) | (Tx1Lsw >>> 31));
	                    var tLsw = Tx4.low  ^ ((Tx1Lsw << 1) | (Tx1Msw >>> 31));
	                    for (var y = 0; y < 5; y++) {
	                        var lane = state[x + 5 * y];
	                        lane.high ^= tMsw;
	                        lane.low  ^= tLsw;
	                    }
	                }

	                // Rho Pi
	                for (var laneIndex = 1; laneIndex < 25; laneIndex++) {
	                    // Shortcuts
	                    var lane = state[laneIndex];
	                    var laneMsw = lane.high;
	                    var laneLsw = lane.low;
	                    var rhoOffset = RHO_OFFSETS[laneIndex];

	                    // Rotate lanes
	                    if (rhoOffset < 32) {
	                        var tMsw = (laneMsw << rhoOffset) | (laneLsw >>> (32 - rhoOffset));
	                        var tLsw = (laneLsw << rhoOffset) | (laneMsw >>> (32 - rhoOffset));
	                    } else /* if (rhoOffset >= 32) */ {
	                        var tMsw = (laneLsw << (rhoOffset - 32)) | (laneMsw >>> (64 - rhoOffset));
	                        var tLsw = (laneMsw << (rhoOffset - 32)) | (laneLsw >>> (64 - rhoOffset));
	                    }

	                    // Transpose lanes
	                    var TPiLane = T[PI_INDEXES[laneIndex]];
	                    TPiLane.high = tMsw;
	                    TPiLane.low  = tLsw;
	                }

	                // Rho pi at x = y = 0
	                var T0 = T[0];
	                var state0 = state[0];
	                T0.high = state0.high;
	                T0.low  = state0.low;

	                // Chi
	                for (var x = 0; x < 5; x++) {
	                    for (var y = 0; y < 5; y++) {
	                        // Shortcuts
	                        var laneIndex = x + 5 * y;
	                        var lane = state[laneIndex];
	                        var TLane = T[laneIndex];
	                        var Tx1Lane = T[((x + 1) % 5) + 5 * y];
	                        var Tx2Lane = T[((x + 2) % 5) + 5 * y];

	                        // Mix rows
	                        lane.high = TLane.high ^ (~Tx1Lane.high & Tx2Lane.high);
	                        lane.low  = TLane.low  ^ (~Tx1Lane.low  & Tx2Lane.low);
	                    }
	                }

	                // Iota
	                var lane = state[0];
	                var roundConstant = ROUND_CONSTANTS[round];
	                lane.high ^= roundConstant.high;
	                lane.low  ^= roundConstant.low;;
	            }
	        },

	        _doFinalize: function () {
	            // Shortcuts
	            var data = this._data;
	            var dataWords = data.words;
	            var nBitsTotal = this._nDataBytes * 8;
	            var nBitsLeft = data.sigBytes * 8;
	            var blockSizeBits = this.blockSize * 32;

	            // Add padding
	            dataWords[nBitsLeft >>> 5] |= 0x1 << (24 - nBitsLeft % 32);
	            dataWords[((Math.ceil((nBitsLeft + 1) / blockSizeBits) * blockSizeBits) >>> 5) - 1] |= 0x80;
	            data.sigBytes = dataWords.length * 4;

	            // Hash final blocks
	            this._process();

	            // Shortcuts
	            var state = this._state;
	            var outputLengthBytes = this.cfg.outputLength / 8;
	            var outputLengthLanes = outputLengthBytes / 8;

	            // Squeeze
	            var hashWords = [];
	            for (var i = 0; i < outputLengthLanes; i++) {
	                // Shortcuts
	                var lane = state[i];
	                var laneMsw = lane.high;
	                var laneLsw = lane.low;

	                // Swap endian
	                laneMsw = (
	                    (((laneMsw << 8)  | (laneMsw >>> 24)) & 0x00ff00ff) |
	                    (((laneMsw << 24) | (laneMsw >>> 8))  & 0xff00ff00)
	                );
	                laneLsw = (
	                    (((laneLsw << 8)  | (laneLsw >>> 24)) & 0x00ff00ff) |
	                    (((laneLsw << 24) | (laneLsw >>> 8))  & 0xff00ff00)
	                );

	                // Squeeze state to retrieve hash
	                hashWords.push(laneLsw);
	                hashWords.push(laneMsw);
	            }

	            // Return final computed hash
	            return new WordArray.init(hashWords, outputLengthBytes);
	        },

	        clone: function () {
	            var clone = Hasher.clone.call(this);

	            var state = clone._state = this._state.slice(0);
	            for (var i = 0; i < 25; i++) {
	                state[i] = state[i].clone();
	            }

	            return clone;
	        }
	    });

	    /**
	     * Shortcut function to the hasher's object interface.
	     *
	     * @param {WordArray|string} message The message to hash.
	     *
	     * @return {WordArray} The hash.
	     *
	     * @static
	     *
	     * @example
	     *
	     *     var hash = CryptoJS.SHA3('message');
	     *     var hash = CryptoJS.SHA3(wordArray);
	     */
	    C.SHA3 = Hasher._createHelper(SHA3);

	    /**
	     * Shortcut function to the HMAC's object interface.
	     *
	     * @param {WordArray|string} message The message to hash.
	     * @param {WordArray|string} key The secret key.
	     *
	     * @return {WordArray} The HMAC.
	     *
	     * @static
	     *
	     * @example
	     *
	     *     var hmac = CryptoJS.HmacSHA3(message, key);
	     */
	    C.HmacSHA3 = Hasher._createHmacHelper(SHA3);
	}(Math));


	return CryptoJS.SHA3;

}));
},{"./core":32,"./x64-core":34}],34:[function(require,module,exports){
;(function (root, factory) {
	if (typeof exports === "object") {
		// CommonJS
		module.exports = exports = factory(require("./core"));
	}
	else if (typeof define === "function" && define.amd) {
		// AMD
		define(["./core"], factory);
	}
	else {
		// Global (browser)
		factory(root.CryptoJS);
	}
}(this, function (CryptoJS) {

	(function (undefined) {
	    // Shortcuts
	    var C = CryptoJS;
	    var C_lib = C.lib;
	    var Base = C_lib.Base;
	    var X32WordArray = C_lib.WordArray;

	    /**
	     * x64 namespace.
	     */
	    var C_x64 = C.x64 = {};

	    /**
	     * A 64-bit word.
	     */
	    var X64Word = C_x64.Word = Base.extend({
	        /**
	         * Initializes a newly created 64-bit word.
	         *
	         * @param {number} high The high 32 bits.
	         * @param {number} low The low 32 bits.
	         *
	         * @example
	         *
	         *     var x64Word = CryptoJS.x64.Word.create(0x00010203, 0x04050607);
	         */
	        init: function (high, low) {
	            this.high = high;
	            this.low = low;
	        }

	        /**
	         * Bitwise NOTs this word.
	         *
	         * @return {X64Word} A new x64-Word object after negating.
	         *
	         * @example
	         *
	         *     var negated = x64Word.not();
	         */
	        // not: function () {
	            // var high = ~this.high;
	            // var low = ~this.low;

	            // return X64Word.create(high, low);
	        // },

	        /**
	         * Bitwise ANDs this word with the passed word.
	         *
	         * @param {X64Word} word The x64-Word to AND with this word.
	         *
	         * @return {X64Word} A new x64-Word object after ANDing.
	         *
	         * @example
	         *
	         *     var anded = x64Word.and(anotherX64Word);
	         */
	        // and: function (word) {
	            // var high = this.high & word.high;
	            // var low = this.low & word.low;

	            // return X64Word.create(high, low);
	        // },

	        /**
	         * Bitwise ORs this word with the passed word.
	         *
	         * @param {X64Word} word The x64-Word to OR with this word.
	         *
	         * @return {X64Word} A new x64-Word object after ORing.
	         *
	         * @example
	         *
	         *     var ored = x64Word.or(anotherX64Word);
	         */
	        // or: function (word) {
	            // var high = this.high | word.high;
	            // var low = this.low | word.low;

	            // return X64Word.create(high, low);
	        // },

	        /**
	         * Bitwise XORs this word with the passed word.
	         *
	         * @param {X64Word} word The x64-Word to XOR with this word.
	         *
	         * @return {X64Word} A new x64-Word object after XORing.
	         *
	         * @example
	         *
	         *     var xored = x64Word.xor(anotherX64Word);
	         */
	        // xor: function (word) {
	            // var high = this.high ^ word.high;
	            // var low = this.low ^ word.low;

	            // return X64Word.create(high, low);
	        // },

	        /**
	         * Shifts this word n bits to the left.
	         *
	         * @param {number} n The number of bits to shift.
	         *
	         * @return {X64Word} A new x64-Word object after shifting.
	         *
	         * @example
	         *
	         *     var shifted = x64Word.shiftL(25);
	         */
	        // shiftL: function (n) {
	            // if (n < 32) {
	                // var high = (this.high << n) | (this.low >>> (32 - n));
	                // var low = this.low << n;
	            // } else {
	                // var high = this.low << (n - 32);
	                // var low = 0;
	            // }

	            // return X64Word.create(high, low);
	        // },

	        /**
	         * Shifts this word n bits to the right.
	         *
	         * @param {number} n The number of bits to shift.
	         *
	         * @return {X64Word} A new x64-Word object after shifting.
	         *
	         * @example
	         *
	         *     var shifted = x64Word.shiftR(7);
	         */
	        // shiftR: function (n) {
	            // if (n < 32) {
	                // var low = (this.low >>> n) | (this.high << (32 - n));
	                // var high = this.high >>> n;
	            // } else {
	                // var low = this.high >>> (n - 32);
	                // var high = 0;
	            // }

	            // return X64Word.create(high, low);
	        // },

	        /**
	         * Rotates this word n bits to the left.
	         *
	         * @param {number} n The number of bits to rotate.
	         *
	         * @return {X64Word} A new x64-Word object after rotating.
	         *
	         * @example
	         *
	         *     var rotated = x64Word.rotL(25);
	         */
	        // rotL: function (n) {
	            // return this.shiftL(n).or(this.shiftR(64 - n));
	        // },

	        /**
	         * Rotates this word n bits to the right.
	         *
	         * @param {number} n The number of bits to rotate.
	         *
	         * @return {X64Word} A new x64-Word object after rotating.
	         *
	         * @example
	         *
	         *     var rotated = x64Word.rotR(7);
	         */
	        // rotR: function (n) {
	            // return this.shiftR(n).or(this.shiftL(64 - n));
	        // },

	        /**
	         * Adds this word with the passed word.
	         *
	         * @param {X64Word} word The x64-Word to add with this word.
	         *
	         * @return {X64Word} A new x64-Word object after adding.
	         *
	         * @example
	         *
	         *     var added = x64Word.add(anotherX64Word);
	         */
	        // add: function (word) {
	            // var low = (this.low + word.low) | 0;
	            // var carry = (low >>> 0) < (this.low >>> 0) ? 1 : 0;
	            // var high = (this.high + word.high + carry) | 0;

	            // return X64Word.create(high, low);
	        // }
	    });

	    /**
	     * An array of 64-bit words.
	     *
	     * @property {Array} words The array of CryptoJS.x64.Word objects.
	     * @property {number} sigBytes The number of significant bytes in this word array.
	     */
	    var X64WordArray = C_x64.WordArray = Base.extend({
	        /**
	         * Initializes a newly created word array.
	         *
	         * @param {Array} words (Optional) An array of CryptoJS.x64.Word objects.
	         * @param {number} sigBytes (Optional) The number of significant bytes in the words.
	         *
	         * @example
	         *
	         *     var wordArray = CryptoJS.x64.WordArray.create();
	         *
	         *     var wordArray = CryptoJS.x64.WordArray.create([
	         *         CryptoJS.x64.Word.create(0x00010203, 0x04050607),
	         *         CryptoJS.x64.Word.create(0x18191a1b, 0x1c1d1e1f)
	         *     ]);
	         *
	         *     var wordArray = CryptoJS.x64.WordArray.create([
	         *         CryptoJS.x64.Word.create(0x00010203, 0x04050607),
	         *         CryptoJS.x64.Word.create(0x18191a1b, 0x1c1d1e1f)
	         *     ], 10);
	         */
	        init: function (words, sigBytes) {
	            words = this.words = words || [];

	            if (sigBytes != undefined) {
	                this.sigBytes = sigBytes;
	            } else {
	                this.sigBytes = words.length * 8;
	            }
	        },

	        /**
	         * Converts this 64-bit word array to a 32-bit word array.
	         *
	         * @return {CryptoJS.lib.WordArray} This word array's data as a 32-bit word array.
	         *
	         * @example
	         *
	         *     var x32WordArray = x64WordArray.toX32();
	         */
	        toX32: function () {
	            // Shortcuts
	            var x64Words = this.words;
	            var x64WordsLength = x64Words.length;

	            // Convert
	            var x32Words = [];
	            for (var i = 0; i < x64WordsLength; i++) {
	                var x64Word = x64Words[i];
	                x32Words.push(x64Word.high);
	                x32Words.push(x64Word.low);
	            }

	            return X32WordArray.create(x32Words, this.sigBytes);
	        },

	        /**
	         * Creates a copy of this word array.
	         *
	         * @return {X64WordArray} The clone.
	         *
	         * @example
	         *
	         *     var clone = x64WordArray.clone();
	         */
	        clone: function () {
	            var clone = Base.clone.call(this);

	            // Clone "words" array
	            var words = clone.words = this.words.slice(0);

	            // Clone each X64Word object
	            var wordsLength = words.length;
	            for (var i = 0; i < wordsLength; i++) {
	                words[i] = words[i].clone();
	            }

	            return clone;
	        }
	    });
	}());


	return CryptoJS;

}));
},{"./core":32}],"bignumber.js":[function(require,module,exports){
/*! bignumber.js v2.0.7 https://github.com/MikeMcl/bignumber.js/LICENCE */

;(function (global) {
    'use strict';

    /*
      bignumber.js v2.0.7
      A JavaScript library for arbitrary-precision arithmetic.
      https://github.com/MikeMcl/bignumber.js
      Copyright (c) 2015 Michael Mclaughlin <M8ch88l@gmail.com>
      MIT Expat Licence
    */


    var BigNumber, crypto, parseNumeric,
        isNumeric = /^-?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i,
        mathceil = Math.ceil,
        mathfloor = Math.floor,
        notBool = ' not a boolean or binary digit',
        roundingMode = 'rounding mode',
        tooManyDigits = 'number type has more than 15 significant digits',
        ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_',
        BASE = 1e14,
        LOG_BASE = 14,
        MAX_SAFE_INTEGER = 0x1fffffffffffff,         // 2^53 - 1
        // MAX_INT32 = 0x7fffffff,                   // 2^31 - 1
        POWS_TEN = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13],
        SQRT_BASE = 1e7,

        /*
         * The limit on the value of DECIMAL_PLACES, TO_EXP_NEG, TO_EXP_POS, MIN_EXP, MAX_EXP, and
         * the arguments to toExponential, toFixed, toFormat, and toPrecision, beyond which an
         * exception is thrown (if ERRORS is true).
         */
        MAX = 1E9;                                   // 0 to MAX_INT32


    /*
     * Create and return a BigNumber constructor.
     */
    function another(configObj) {
        var div,

            // id tracks the caller function, so its name can be included in error messages.
            id = 0,
            P = BigNumber.prototype,
            ONE = new BigNumber(1),


            /********************************* EDITABLE DEFAULTS **********************************/


            /*
             * The default values below must be integers within the inclusive ranges stated.
             * The values can also be changed at run-time using BigNumber.config.
             */

            // The maximum number of decimal places for operations involving division.
            DECIMAL_PLACES = 20,                     // 0 to MAX

            /*
             * The rounding mode used when rounding to the above decimal places, and when using
             * toExponential, toFixed, toFormat and toPrecision, and round (default value).
             * UP         0 Away from zero.
             * DOWN       1 Towards zero.
             * CEIL       2 Towards +Infinity.
             * FLOOR      3 Towards -Infinity.
             * HALF_UP    4 Towards nearest neighbour. If equidistant, up.
             * HALF_DOWN  5 Towards nearest neighbour. If equidistant, down.
             * HALF_EVEN  6 Towards nearest neighbour. If equidistant, towards even neighbour.
             * HALF_CEIL  7 Towards nearest neighbour. If equidistant, towards +Infinity.
             * HALF_FLOOR 8 Towards nearest neighbour. If equidistant, towards -Infinity.
             */
            ROUNDING_MODE = 4,                       // 0 to 8

            // EXPONENTIAL_AT : [TO_EXP_NEG , TO_EXP_POS]

            // The exponent value at and beneath which toString returns exponential notation.
            // Number type: -7
            TO_EXP_NEG = -7,                         // 0 to -MAX

            // The exponent value at and above which toString returns exponential notation.
            // Number type: 21
            TO_EXP_POS = 21,                         // 0 to MAX

            // RANGE : [MIN_EXP, MAX_EXP]

            // The minimum exponent value, beneath which underflow to zero occurs.
            // Number type: -324  (5e-324)
            MIN_EXP = -1e7,                          // -1 to -MAX

            // The maximum exponent value, above which overflow to Infinity occurs.
            // Number type:  308  (1.7976931348623157e+308)
            // For MAX_EXP > 1e7, e.g. new BigNumber('1e100000000').plus(1) may be slow.
            MAX_EXP = 1e7,                           // 1 to MAX

            // Whether BigNumber Errors are ever thrown.
            ERRORS = true,                           // true or false

            // Change to intValidatorNoErrors if ERRORS is false.
            isValidInt = intValidatorWithErrors,     // intValidatorWithErrors/intValidatorNoErrors

            // Whether to use cryptographically-secure random number generation, if available.
            CRYPTO = false,                          // true or false

            /*
             * The modulo mode used when calculating the modulus: a mod n.
             * The quotient (q = a / n) is calculated according to the corresponding rounding mode.
             * The remainder (r) is calculated as: r = a - n * q.
             *
             * UP        0 The remainder is positive if the dividend is negative, else is negative.
             * DOWN      1 The remainder has the same sign as the dividend.
             *             This modulo mode is commonly known as 'truncated division' and is
             *             equivalent to (a % n) in JavaScript.
             * FLOOR     3 The remainder has the same sign as the divisor (Python %).
             * HALF_EVEN 6 This modulo mode implements the IEEE 754 remainder function.
             * EUCLID    9 Euclidian division. q = sign(n) * floor(a / abs(n)).
             *             The remainder is always positive.
             *
             * The truncated division, floored division, Euclidian division and IEEE 754 remainder
             * modes are commonly used for the modulus operation.
             * Although the other rounding modes can also be used, they may not give useful results.
             */
            MODULO_MODE = 1,                         // 0 to 9

            // The maximum number of significant digits of the result of the toPower operation.
            // If POW_PRECISION is 0, there will be unlimited significant digits.
            POW_PRECISION = 100,                     // 0 to MAX

            // The format specification used by the BigNumber.prototype.toFormat method.
            FORMAT = {
                decimalSeparator: '.',
                groupSeparator: ',',
                groupSize: 3,
                secondaryGroupSize: 0,
                fractionGroupSeparator: '\xA0',      // non-breaking space
                fractionGroupSize: 0
            };


        /******************************************************************************************/


        // CONSTRUCTOR


        /*
         * The BigNumber constructor and exported function.
         * Create and return a new instance of a BigNumber object.
         *
         * n {number|string|BigNumber} A numeric value.
         * [b] {number} The base of n. Integer, 2 to 64 inclusive.
         */
        function BigNumber( n, b ) {
            var c, e, i, num, len, str,
                x = this;

            // Enable constructor usage without new.
            if ( !( x instanceof BigNumber ) ) {

                // 'BigNumber() constructor call without new: {n}'
                if (ERRORS) raise( 26, 'constructor call without new', n );
                return new BigNumber( n, b );
            }

            // 'new BigNumber() base not an integer: {b}'
            // 'new BigNumber() base out of range: {b}'
            if ( b == null || !isValidInt( b, 2, 64, id, 'base' ) ) {

                // Duplicate.
                if ( n instanceof BigNumber ) {
                    x.s = n.s;
                    x.e = n.e;
                    x.c = ( n = n.c ) ? n.slice() : n;
                    id = 0;
                    return;
                }

                if ( ( num = typeof n == 'number' ) && n * 0 == 0 ) {
                    x.s = 1 / n < 0 ? ( n = -n, -1 ) : 1;

                    // Fast path for integers.
                    if ( n === ~~n ) {
                        for ( e = 0, i = n; i >= 10; i /= 10, e++ );
                        x.e = e;
                        x.c = [n];
                        id = 0;
                        return;
                    }

                    str = n + '';
                } else {
                    if ( !isNumeric.test( str = n + '' ) ) return parseNumeric( x, str, num );
                    x.s = str.charCodeAt(0) === 45 ? ( str = str.slice(1), -1 ) : 1;
                }
            } else {
                b = b | 0;
                str = n + '';

                // Ensure return value is rounded to DECIMAL_PLACES as with other bases.
                // Allow exponential notation to be used with base 10 argument.
                if ( b == 10 ) {
                    x = new BigNumber( n instanceof BigNumber ? n : str );
                    return round( x, DECIMAL_PLACES + x.e + 1, ROUNDING_MODE );
                }

                // Avoid potential interpretation of Infinity and NaN as base 44+ values.
                // Any number in exponential form will fail due to the [Ee][+-].
                if ( ( num = typeof n == 'number' ) && n * 0 != 0 ||
                  !( new RegExp( '^-?' + ( c = '[' + ALPHABET.slice( 0, b ) + ']+' ) +
                    '(?:\\.' + c + ')?$',b < 37 ? 'i' : '' ) ).test(str) ) {
                    return parseNumeric( x, str, num, b );
                }

                if (num) {
                    x.s = 1 / n < 0 ? ( str = str.slice(1), -1 ) : 1;

                    if ( ERRORS && str.replace( /^0\.0*|\./, '' ).length > 15 ) {

                        // 'new BigNumber() number type has more than 15 significant digits: {n}'
                        raise( id, tooManyDigits, n );
                    }

                    // Prevent later check for length on converted number.
                    num = false;
                } else {
                    x.s = str.charCodeAt(0) === 45 ? ( str = str.slice(1), -1 ) : 1;
                }

                str = convertBase( str, 10, b, x.s );
            }

            // Decimal point?
            if ( ( e = str.indexOf('.') ) > -1 ) str = str.replace( '.', '' );

            // Exponential form?
            if ( ( i = str.search( /e/i ) ) > 0 ) {

                // Determine exponent.
                if ( e < 0 ) e = i;
                e += +str.slice( i + 1 );
                str = str.substring( 0, i );
            } else if ( e < 0 ) {

                // Integer.
                e = str.length;
            }

            // Determine leading zeros.
            for ( i = 0; str.charCodeAt(i) === 48; i++ );

            // Determine trailing zeros.
            for ( len = str.length; str.charCodeAt(--len) === 48; );
            str = str.slice( i, len + 1 );

            if (str) {
                len = str.length;

                // Disallow numbers with over 15 significant digits if number type.
                // 'new BigNumber() number type has more than 15 significant digits: {n}'
                if ( num && ERRORS && len > 15 ) raise( id, tooManyDigits, x.s * n );

                e = e - i - 1;

                 // Overflow?
                if ( e > MAX_EXP ) {

                    // Infinity.
                    x.c = x.e = null;

                // Underflow?
                } else if ( e < MIN_EXP ) {

                    // Zero.
                    x.c = [ x.e = 0 ];
                } else {
                    x.e = e;
                    x.c = [];

                    // Transform base

                    // e is the base 10 exponent.
                    // i is where to slice str to get the first element of the coefficient array.
                    i = ( e + 1 ) % LOG_BASE;
                    if ( e < 0 ) i += LOG_BASE;

                    if ( i < len ) {
                        if (i) x.c.push( +str.slice( 0, i ) );

                        for ( len -= LOG_BASE; i < len; ) {
                            x.c.push( +str.slice( i, i += LOG_BASE ) );
                        }

                        str = str.slice(i);
                        i = LOG_BASE - str.length;
                    } else {
                        i -= len;
                    }

                    for ( ; i--; str += '0' );
                    x.c.push( +str );
                }
            } else {

                // Zero.
                x.c = [ x.e = 0 ];
            }

            id = 0;
        }


        // CONSTRUCTOR PROPERTIES


        BigNumber.another = another;

        BigNumber.ROUND_UP = 0;
        BigNumber.ROUND_DOWN = 1;
        BigNumber.ROUND_CEIL = 2;
        BigNumber.ROUND_FLOOR = 3;
        BigNumber.ROUND_HALF_UP = 4;
        BigNumber.ROUND_HALF_DOWN = 5;
        BigNumber.ROUND_HALF_EVEN = 6;
        BigNumber.ROUND_HALF_CEIL = 7;
        BigNumber.ROUND_HALF_FLOOR = 8;
        BigNumber.EUCLID = 9;


        /*
         * Configure infrequently-changing library-wide settings.
         *
         * Accept an object or an argument list, with one or many of the following properties or
         * parameters respectively:
         *
         *   DECIMAL_PLACES  {number}  Integer, 0 to MAX inclusive
         *   ROUNDING_MODE   {number}  Integer, 0 to 8 inclusive
         *   EXPONENTIAL_AT  {number|number[]}  Integer, -MAX to MAX inclusive or
         *                                      [integer -MAX to 0 incl., 0 to MAX incl.]
         *   RANGE           {number|number[]}  Non-zero integer, -MAX to MAX inclusive or
         *                                      [integer -MAX to -1 incl., integer 1 to MAX incl.]
         *   ERRORS          {boolean|number}   true, false, 1 or 0
         *   CRYPTO          {boolean|number}   true, false, 1 or 0
         *   MODULO_MODE     {number}           0 to 9 inclusive
         *   POW_PRECISION   {number}           0 to MAX inclusive
         *   FORMAT          {object}           See BigNumber.prototype.toFormat
         *      decimalSeparator       {string}
         *      groupSeparator         {string}
         *      groupSize              {number}
         *      secondaryGroupSize     {number}
         *      fractionGroupSeparator {string}
         *      fractionGroupSize      {number}
         *
         * (The values assigned to the above FORMAT object properties are not checked for validity.)
         *
         * E.g.
         * BigNumber.config(20, 4) is equivalent to
         * BigNumber.config({ DECIMAL_PLACES : 20, ROUNDING_MODE : 4 })
         *
         * Ignore properties/parameters set to null or undefined.
         * Return an object with the properties current values.
         */
        BigNumber.config = function () {
            var v, p,
                i = 0,
                r = {},
                a = arguments,
                o = a[0],
                has = o && typeof o == 'object'
                  ? function () { if ( o.hasOwnProperty(p) ) return ( v = o[p] ) != null; }
                  : function () { if ( a.length > i ) return ( v = a[i++] ) != null; };

            // DECIMAL_PLACES {number} Integer, 0 to MAX inclusive.
            // 'config() DECIMAL_PLACES not an integer: {v}'
            // 'config() DECIMAL_PLACES out of range: {v}'
            if ( has( p = 'DECIMAL_PLACES' ) && isValidInt( v, 0, MAX, 2, p ) ) {
                DECIMAL_PLACES = v | 0;
            }
            r[p] = DECIMAL_PLACES;

            // ROUNDING_MODE {number} Integer, 0 to 8 inclusive.
            // 'config() ROUNDING_MODE not an integer: {v}'
            // 'config() ROUNDING_MODE out of range: {v}'
            if ( has( p = 'ROUNDING_MODE' ) && isValidInt( v, 0, 8, 2, p ) ) {
                ROUNDING_MODE = v | 0;
            }
            r[p] = ROUNDING_MODE;

            // EXPONENTIAL_AT {number|number[]}
            // Integer, -MAX to MAX inclusive or [integer -MAX to 0 inclusive, 0 to MAX inclusive].
            // 'config() EXPONENTIAL_AT not an integer: {v}'
            // 'config() EXPONENTIAL_AT out of range: {v}'
            if ( has( p = 'EXPONENTIAL_AT' ) ) {

                if ( isArray(v) ) {
                    if ( isValidInt( v[0], -MAX, 0, 2, p ) && isValidInt( v[1], 0, MAX, 2, p ) ) {
                        TO_EXP_NEG = v[0] | 0;
                        TO_EXP_POS = v[1] | 0;
                    }
                } else if ( isValidInt( v, -MAX, MAX, 2, p ) ) {
                    TO_EXP_NEG = -( TO_EXP_POS = ( v < 0 ? -v : v ) | 0 );
                }
            }
            r[p] = [ TO_EXP_NEG, TO_EXP_POS ];

            // RANGE {number|number[]} Non-zero integer, -MAX to MAX inclusive or
            // [integer -MAX to -1 inclusive, integer 1 to MAX inclusive].
            // 'config() RANGE not an integer: {v}'
            // 'config() RANGE cannot be zero: {v}'
            // 'config() RANGE out of range: {v}'
            if ( has( p = 'RANGE' ) ) {

                if ( isArray(v) ) {
                    if ( isValidInt( v[0], -MAX, -1, 2, p ) && isValidInt( v[1], 1, MAX, 2, p ) ) {
                        MIN_EXP = v[0] | 0;
                        MAX_EXP = v[1] | 0;
                    }
                } else if ( isValidInt( v, -MAX, MAX, 2, p ) ) {
                    if ( v | 0 ) MIN_EXP = -( MAX_EXP = ( v < 0 ? -v : v ) | 0 );
                    else if (ERRORS) raise( 2, p + ' cannot be zero', v );
                }
            }
            r[p] = [ MIN_EXP, MAX_EXP ];

            // ERRORS {boolean|number} true, false, 1 or 0.
            // 'config() ERRORS not a boolean or binary digit: {v}'
            if ( has( p = 'ERRORS' ) ) {

                if ( v === !!v || v === 1 || v === 0 ) {
                    id = 0;
                    isValidInt = ( ERRORS = !!v ) ? intValidatorWithErrors : intValidatorNoErrors;
                } else if (ERRORS) {
                    raise( 2, p + notBool, v );
                }
            }
            r[p] = ERRORS;

            // CRYPTO {boolean|number} true, false, 1 or 0.
            // 'config() CRYPTO not a boolean or binary digit: {v}'
            // 'config() crypto unavailable: {crypto}'
            if ( has( p = 'CRYPTO' ) ) {

                if ( v === !!v || v === 1 || v === 0 ) {
                    CRYPTO = !!( v && crypto && typeof crypto == 'object' );
                    if ( v && !CRYPTO && ERRORS ) raise( 2, 'crypto unavailable', crypto );
                } else if (ERRORS) {
                    raise( 2, p + notBool, v );
                }
            }
            r[p] = CRYPTO;

            // MODULO_MODE {number} Integer, 0 to 9 inclusive.
            // 'config() MODULO_MODE not an integer: {v}'
            // 'config() MODULO_MODE out of range: {v}'
            if ( has( p = 'MODULO_MODE' ) && isValidInt( v, 0, 9, 2, p ) ) {
                MODULO_MODE = v | 0;
            }
            r[p] = MODULO_MODE;

            // POW_PRECISION {number} Integer, 0 to MAX inclusive.
            // 'config() POW_PRECISION not an integer: {v}'
            // 'config() POW_PRECISION out of range: {v}'
            if ( has( p = 'POW_PRECISION' ) && isValidInt( v, 0, MAX, 2, p ) ) {
                POW_PRECISION = v | 0;
            }
            r[p] = POW_PRECISION;

            // FORMAT {object}
            // 'config() FORMAT not an object: {v}'
            if ( has( p = 'FORMAT' ) ) {

                if ( typeof v == 'object' ) {
                    FORMAT = v;
                } else if (ERRORS) {
                    raise( 2, p + ' not an object', v );
                }
            }
            r[p] = FORMAT;

            return r;
        };


        /*
         * Return a new BigNumber whose value is the maximum of the arguments.
         *
         * arguments {number|string|BigNumber}
         */
        BigNumber.max = function () { return maxOrMin( arguments, P.lt ); };


        /*
         * Return a new BigNumber whose value is the minimum of the arguments.
         *
         * arguments {number|string|BigNumber}
         */
        BigNumber.min = function () { return maxOrMin( arguments, P.gt ); };


        /*
         * Return a new BigNumber with a random value equal to or greater than 0 and less than 1,
         * and with dp, or DECIMAL_PLACES if dp is omitted, decimal places (or less if trailing
         * zeros are produced).
         *
         * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
         *
         * 'random() decimal places not an integer: {dp}'
         * 'random() decimal places out of range: {dp}'
         * 'random() crypto unavailable: {crypto}'
         */
        BigNumber.random = (function () {
            var pow2_53 = 0x20000000000000;

            // Return a 53 bit integer n, where 0 <= n < 9007199254740992.
            // Check if Math.random() produces more than 32 bits of randomness.
            // If it does, assume at least 53 bits are produced, otherwise assume at least 30 bits.
            // 0x40000000 is 2^30, 0x800000 is 2^23, 0x1fffff is 2^21 - 1.
            var random53bitInt = (Math.random() * pow2_53) & 0x1fffff
              ? function () { return mathfloor( Math.random() * pow2_53 ); }
              : function () { return ((Math.random() * 0x40000000 | 0) * 0x800000) +
                  (Math.random() * 0x800000 | 0); };

            return function (dp) {
                var a, b, e, k, v,
                    i = 0,
                    c = [],
                    rand = new BigNumber(ONE);

                dp = dp == null || !isValidInt( dp, 0, MAX, 14 ) ? DECIMAL_PLACES : dp | 0;
                k = mathceil( dp / LOG_BASE );

                if (CRYPTO) {

                    // Browsers supporting crypto.getRandomValues.
                    if ( crypto && crypto.getRandomValues ) {

                        a = crypto.getRandomValues( new Uint32Array( k *= 2 ) );

                        for ( ; i < k; ) {

                            // 53 bits:
                            // ((Math.pow(2, 32) - 1) * Math.pow(2, 21)).toString(2)
                            // 11111 11111111 11111111 11111111 11100000 00000000 00000000
                            // ((Math.pow(2, 32) - 1) >>> 11).toString(2)
                            //                                     11111 11111111 11111111
                            // 0x20000 is 2^21.
                            v = a[i] * 0x20000 + (a[i + 1] >>> 11);

                            // Rejection sampling:
                            // 0 <= v < 9007199254740992
                            // Probability that v >= 9e15, is
                            // 7199254740992 / 9007199254740992 ~= 0.0008, i.e. 1 in 1251
                            if ( v >= 9e15 ) {
                                b = crypto.getRandomValues( new Uint32Array(2) );
                                a[i] = b[0];
                                a[i + 1] = b[1];
                            } else {

                                // 0 <= v <= 8999999999999999
                                // 0 <= (v % 1e14) <= 99999999999999
                                c.push( v % 1e14 );
                                i += 2;
                            }
                        }
                        i = k / 2;

                    // Node.js supporting crypto.randomBytes.
                    } else if ( crypto && crypto.randomBytes ) {

                        // buffer
                        a = crypto.randomBytes( k *= 7 );

                        for ( ; i < k; ) {

                            // 0x1000000000000 is 2^48, 0x10000000000 is 2^40
                            // 0x100000000 is 2^32, 0x1000000 is 2^24
                            // 11111 11111111 11111111 11111111 11111111 11111111 11111111
                            // 0 <= v < 9007199254740992
                            v = ( ( a[i] & 31 ) * 0x1000000000000 ) + ( a[i + 1] * 0x10000000000 ) +
                                  ( a[i + 2] * 0x100000000 ) + ( a[i + 3] * 0x1000000 ) +
                                  ( a[i + 4] << 16 ) + ( a[i + 5] << 8 ) + a[i + 6];

                            if ( v >= 9e15 ) {
                                crypto.randomBytes(7).copy( a, i );
                            } else {

                                // 0 <= (v % 1e14) <= 99999999999999
                                c.push( v % 1e14 );
                                i += 7;
                            }
                        }
                        i = k / 7;
                    } else if (ERRORS) {
                        raise( 14, 'crypto unavailable', crypto );
                    }
                }

                // Use Math.random: CRYPTO is false or crypto is unavailable and ERRORS is false.
                if (!i) {

                    for ( ; i < k; ) {
                        v = random53bitInt();
                        if ( v < 9e15 ) c[i++] = v % 1e14;
                    }
                }

                k = c[--i];
                dp %= LOG_BASE;

                // Convert trailing digits to zeros according to dp.
                if ( k && dp ) {
                    v = POWS_TEN[LOG_BASE - dp];
                    c[i] = mathfloor( k / v ) * v;
                }

                // Remove trailing elements which are zero.
                for ( ; c[i] === 0; c.pop(), i-- );

                // Zero?
                if ( i < 0 ) {
                    c = [ e = 0 ];
                } else {

                    // Remove leading elements which are zero and adjust exponent accordingly.
                    for ( e = -1 ; c[0] === 0; c.shift(), e -= LOG_BASE);

                    // Count the digits of the first element of c to determine leading zeros, and...
                    for ( i = 1, v = c[0]; v >= 10; v /= 10, i++);

                    // adjust the exponent accordingly.
                    if ( i < LOG_BASE ) e -= LOG_BASE - i;
                }

                rand.e = e;
                rand.c = c;
                return rand;
            };
        })();


        // PRIVATE FUNCTIONS


        // Convert a numeric string of baseIn to a numeric string of baseOut.
        function convertBase( str, baseOut, baseIn, sign ) {
            var d, e, k, r, x, xc, y,
                i = str.indexOf( '.' ),
                dp = DECIMAL_PLACES,
                rm = ROUNDING_MODE;

            if ( baseIn < 37 ) str = str.toLowerCase();

            // Non-integer.
            if ( i >= 0 ) {
                k = POW_PRECISION;

                // Unlimited precision.
                POW_PRECISION = 0;
                str = str.replace( '.', '' );
                y = new BigNumber(baseIn);
                x = y.pow( str.length - i );
                POW_PRECISION = k;

                // Convert str as if an integer, then restore the fraction part by dividing the
                // result by its base raised to a power.
                y.c = toBaseOut( toFixedPoint( coeffToString( x.c ), x.e ), 10, baseOut );
                y.e = y.c.length;
            }

            // Convert the number as integer.
            xc = toBaseOut( str, baseIn, baseOut );
            e = k = xc.length;

            // Remove trailing zeros.
            for ( ; xc[--k] == 0; xc.pop() );
            if ( !xc[0] ) return '0';

            if ( i < 0 ) {
                --e;
            } else {
                x.c = xc;
                x.e = e;

                // sign is needed for correct rounding.
                x.s = sign;
                x = div( x, y, dp, rm, baseOut );
                xc = x.c;
                r = x.r;
                e = x.e;
            }

            d = e + dp + 1;

            // The rounding digit, i.e. the digit to the right of the digit that may be rounded up.
            i = xc[d];
            k = baseOut / 2;
            r = r || d < 0 || xc[d + 1] != null;

            r = rm < 4 ? ( i != null || r ) && ( rm == 0 || rm == ( x.s < 0 ? 3 : 2 ) )
                       : i > k || i == k &&( rm == 4 || r || rm == 6 && xc[d - 1] & 1 ||
                         rm == ( x.s < 0 ? 8 : 7 ) );

            if ( d < 1 || !xc[0] ) {

                // 1^-dp or 0.
                str = r ? toFixedPoint( '1', -dp ) : '0';
            } else {
                xc.length = d;

                if (r) {

                    // Rounding up may mean the previous digit has to be rounded up and so on.
                    for ( --baseOut; ++xc[--d] > baseOut; ) {
                        xc[d] = 0;

                        if ( !d ) {
                            ++e;
                            xc.unshift(1);
                        }
                    }
                }

                // Determine trailing zeros.
                for ( k = xc.length; !xc[--k]; );

                // E.g. [4, 11, 15] becomes 4bf.
                for ( i = 0, str = ''; i <= k; str += ALPHABET.charAt( xc[i++] ) );
                str = toFixedPoint( str, e );
            }

            // The caller will add the sign.
            return str;
        }


        // Perform division in the specified base. Called by div and convertBase.
        div = (function () {

            // Assume non-zero x and k.
            function multiply( x, k, base ) {
                var m, temp, xlo, xhi,
                    carry = 0,
                    i = x.length,
                    klo = k % SQRT_BASE,
                    khi = k / SQRT_BASE | 0;

                for ( x = x.slice(); i--; ) {
                    xlo = x[i] % SQRT_BASE;
                    xhi = x[i] / SQRT_BASE | 0;
                    m = khi * xlo + xhi * klo;
                    temp = klo * xlo + ( ( m % SQRT_BASE ) * SQRT_BASE ) + carry;
                    carry = ( temp / base | 0 ) + ( m / SQRT_BASE | 0 ) + khi * xhi;
                    x[i] = temp % base;
                }

                if (carry) x.unshift(carry);

                return x;
            }

            function compare( a, b, aL, bL ) {
                var i, cmp;

                if ( aL != bL ) {
                    cmp = aL > bL ? 1 : -1;
                } else {

                    for ( i = cmp = 0; i < aL; i++ ) {

                        if ( a[i] != b[i] ) {
                            cmp = a[i] > b[i] ? 1 : -1;
                            break;
                        }
                    }
                }
                return cmp;
            }

            function subtract( a, b, aL, base ) {
                var i = 0;

                // Subtract b from a.
                for ( ; aL--; ) {
                    a[aL] -= i;
                    i = a[aL] < b[aL] ? 1 : 0;
                    a[aL] = i * base + a[aL] - b[aL];
                }

                // Remove leading zeros.
                for ( ; !a[0] && a.length > 1; a.shift() );
            }

            // x: dividend, y: divisor.
            return function ( x, y, dp, rm, base ) {
                var cmp, e, i, more, n, prod, prodL, q, qc, rem, remL, rem0, xi, xL, yc0,
                    yL, yz,
                    s = x.s == y.s ? 1 : -1,
                    xc = x.c,
                    yc = y.c;

                // Either NaN, Infinity or 0?
                if ( !xc || !xc[0] || !yc || !yc[0] ) {

                    return new BigNumber(

                      // Return NaN if either NaN, or both Infinity or 0.
                      !x.s || !y.s || ( xc ? yc && xc[0] == yc[0] : !yc ) ? NaN :

                        // Return ±0 if x is ±0 or y is ±Infinity, or return ±Infinity as y is ±0.
                        xc && xc[0] == 0 || !yc ? s * 0 : s / 0
                    );
                }

                q = new BigNumber(s);
                qc = q.c = [];
                e = x.e - y.e;
                s = dp + e + 1;

                if ( !base ) {
                    base = BASE;
                    e = bitFloor( x.e / LOG_BASE ) - bitFloor( y.e / LOG_BASE );
                    s = s / LOG_BASE | 0;
                }

                // Result exponent may be one less then the current value of e.
                // The coefficients of the BigNumbers from convertBase may have trailing zeros.
                for ( i = 0; yc[i] == ( xc[i] || 0 ); i++ );
                if ( yc[i] > ( xc[i] || 0 ) ) e--;

                if ( s < 0 ) {
                    qc.push(1);
                    more = true;
                } else {
                    xL = xc.length;
                    yL = yc.length;
                    i = 0;
                    s += 2;

                    // Normalise xc and yc so highest order digit of yc is >= base / 2.

                    n = mathfloor( base / ( yc[0] + 1 ) );

                    // Not necessary, but to handle odd bases where yc[0] == ( base / 2 ) - 1.
                    // if ( n > 1 || n++ == 1 && yc[0] < base / 2 ) {
                    if ( n > 1 ) {
                        yc = multiply( yc, n, base );
                        xc = multiply( xc, n, base );
                        yL = yc.length;
                        xL = xc.length;
                    }

                    xi = yL;
                    rem = xc.slice( 0, yL );
                    remL = rem.length;

                    // Add zeros to make remainder as long as divisor.
                    for ( ; remL < yL; rem[remL++] = 0 );
                    yz = yc.slice();
                    yz.unshift(0);
                    yc0 = yc[0];
                    if ( yc[1] >= base / 2 ) yc0++;
                    // Not necessary, but to prevent trial digit n > base, when using base 3.
                    // else if ( base == 3 && yc0 == 1 ) yc0 = 1 + 1e-15;

                    do {
                        n = 0;

                        // Compare divisor and remainder.
                        cmp = compare( yc, rem, yL, remL );

                        // If divisor < remainder.
                        if ( cmp < 0 ) {

                            // Calculate trial digit, n.

                            rem0 = rem[0];
                            if ( yL != remL ) rem0 = rem0 * base + ( rem[1] || 0 );

                            // n is how many times the divisor goes into the current remainder.
                            n = mathfloor( rem0 / yc0 );

                            //  Algorithm:
                            //  1. product = divisor * trial digit (n)
                            //  2. if product > remainder: product -= divisor, n--
                            //  3. remainder -= product
                            //  4. if product was < remainder at 2:
                            //    5. compare new remainder and divisor
                            //    6. If remainder > divisor: remainder -= divisor, n++

                            if ( n > 1 ) {

                                // n may be > base only when base is 3.
                                if (n >= base) n = base - 1;

                                // product = divisor * trial digit.
                                prod = multiply( yc, n, base );
                                prodL = prod.length;
                                remL = rem.length;

                                // Compare product and remainder.
                                // If product > remainder.
                                // Trial digit n too high.
                                // n is 1 too high about 5% of the time, and is not known to have
                                // ever been more than 1 too high.
                                while ( compare( prod, rem, prodL, remL ) == 1 ) {
                                    n--;

                                    // Subtract divisor from product.
                                    subtract( prod, yL < prodL ? yz : yc, prodL, base );
                                    prodL = prod.length;
                                    cmp = 1;
                                }
                            } else {

                                // n is 0 or 1, cmp is -1.
                                // If n is 0, there is no need to compare yc and rem again below,
                                // so change cmp to 1 to avoid it.
                                // If n is 1, leave cmp as -1, so yc and rem are compared again.
                                if ( n == 0 ) {

                                    // divisor < remainder, so n must be at least 1.
                                    cmp = n = 1;
                                }

                                // product = divisor
                                prod = yc.slice();
                                prodL = prod.length;
                            }

                            if ( prodL < remL ) prod.unshift(0);

                            // Subtract product from remainder.
                            subtract( rem, prod, remL, base );
                            remL = rem.length;

                             // If product was < remainder.
                            if ( cmp == -1 ) {

                                // Compare divisor and new remainder.
                                // If divisor < new remainder, subtract divisor from remainder.
                                // Trial digit n too low.
                                // n is 1 too low about 5% of the time, and very rarely 2 too low.
                                while ( compare( yc, rem, yL, remL ) < 1 ) {
                                    n++;

                                    // Subtract divisor from remainder.
                                    subtract( rem, yL < remL ? yz : yc, remL, base );
                                    remL = rem.length;
                                }
                            }
                        } else if ( cmp === 0 ) {
                            n++;
                            rem = [0];
                        } // else cmp === 1 and n will be 0

                        // Add the next digit, n, to the result array.
                        qc[i++] = n;

                        // Update the remainder.
                        if ( rem[0] ) {
                            rem[remL++] = xc[xi] || 0;
                        } else {
                            rem = [ xc[xi] ];
                            remL = 1;
                        }
                    } while ( ( xi++ < xL || rem[0] != null ) && s-- );

                    more = rem[0] != null;

                    // Leading zero?
                    if ( !qc[0] ) qc.shift();
                }

                if ( base == BASE ) {

                    // To calculate q.e, first get the number of digits of qc[0].
                    for ( i = 1, s = qc[0]; s >= 10; s /= 10, i++ );
                    round( q, dp + ( q.e = i + e * LOG_BASE - 1 ) + 1, rm, more );

                // Caller is convertBase.
                } else {
                    q.e = e;
                    q.r = +more;
                }

                return q;
            };
        })();


        /*
         * Return a string representing the value of BigNumber n in fixed-point or exponential
         * notation rounded to the specified decimal places or significant digits.
         *
         * n is a BigNumber.
         * i is the index of the last digit required (i.e. the digit that may be rounded up).
         * rm is the rounding mode.
         * caller is caller id: toExponential 19, toFixed 20, toFormat 21, toPrecision 24.
         */
        function format( n, i, rm, caller ) {
            var c0, e, ne, len, str;

            rm = rm != null && isValidInt( rm, 0, 8, caller, roundingMode )
              ? rm | 0 : ROUNDING_MODE;

            if ( !n.c ) return n.toString();
            c0 = n.c[0];
            ne = n.e;

            if ( i == null ) {
                str = coeffToString( n.c );
                str = caller == 19 || caller == 24 && ne <= TO_EXP_NEG
                  ? toExponential( str, ne )
                  : toFixedPoint( str, ne );
            } else {
                n = round( new BigNumber(n), i, rm );

                // n.e may have changed if the value was rounded up.
                e = n.e;

                str = coeffToString( n.c );
                len = str.length;

                // toPrecision returns exponential notation if the number of significant digits
                // specified is less than the number of digits necessary to represent the integer
                // part of the value in fixed-point notation.

                // Exponential notation.
                if ( caller == 19 || caller == 24 && ( i <= e || e <= TO_EXP_NEG ) ) {

                    // Append zeros?
                    for ( ; len < i; str += '0', len++ );
                    str = toExponential( str, e );

                // Fixed-point notation.
                } else {
                    i -= ne;
                    str = toFixedPoint( str, e );

                    // Append zeros?
                    if ( e + 1 > len ) {
                        if ( --i > 0 ) for ( str += '.'; i--; str += '0' );
                    } else {
                        i += e - len;
                        if ( i > 0 ) {
                            if ( e + 1 == len ) str += '.';
                            for ( ; i--; str += '0' );
                        }
                    }
                }
            }

            return n.s < 0 && c0 ? '-' + str : str;
        }


        // Handle BigNumber.max and BigNumber.min.
        function maxOrMin( args, method ) {
            var m, n,
                i = 0;

            if ( isArray( args[0] ) ) args = args[0];
            m = new BigNumber( args[0] );

            for ( ; ++i < args.length; ) {
                n = new BigNumber( args[i] );

                // If any number is NaN, return NaN.
                if ( !n.s ) {
                    m = n;
                    break;
                } else if ( method.call( m, n ) ) {
                    m = n;
                }
            }

            return m;
        }


        /*
         * Return true if n is an integer in range, otherwise throw.
         * Use for argument validation when ERRORS is true.
         */
        function intValidatorWithErrors( n, min, max, caller, name ) {
            if ( n < min || n > max || n != truncate(n) ) {
                raise( caller, ( name || 'decimal places' ) +
                  ( n < min || n > max ? ' out of range' : ' not an integer' ), n );
            }

            return true;
        }


        /*
         * Strip trailing zeros, calculate base 10 exponent and check against MIN_EXP and MAX_EXP.
         * Called by minus, plus and times.
         */
        function normalise( n, c, e ) {
            var i = 1,
                j = c.length;

             // Remove trailing zeros.
            for ( ; !c[--j]; c.pop() );

            // Calculate the base 10 exponent. First get the number of digits of c[0].
            for ( j = c[0]; j >= 10; j /= 10, i++ );

            // Overflow?
            if ( ( e = i + e * LOG_BASE - 1 ) > MAX_EXP ) {

                // Infinity.
                n.c = n.e = null;

            // Underflow?
            } else if ( e < MIN_EXP ) {

                // Zero.
                n.c = [ n.e = 0 ];
            } else {
                n.e = e;
                n.c = c;
            }

            return n;
        }


        // Handle values that fail the validity test in BigNumber.
        parseNumeric = (function () {
            var basePrefix = /^(-?)0([xbo])/i,
                dotAfter = /^([^.]+)\.$/,
                dotBefore = /^\.([^.]+)$/,
                isInfinityOrNaN = /^-?(Infinity|NaN)$/,
                whitespaceOrPlus = /^\s*\+|^\s+|\s+$/g;

            return function ( x, str, num, b ) {
                var base,
                    s = num ? str : str.replace( whitespaceOrPlus, '' );

                // No exception on ±Infinity or NaN.
                if ( isInfinityOrNaN.test(s) ) {
                    x.s = isNaN(s) ? null : s < 0 ? -1 : 1;
                } else {
                    if ( !num ) {

                        // basePrefix = /^(-?)0([xbo])(?=\w[\w.]*$)/i
                        s = s.replace( basePrefix, function ( m, p1, p2 ) {
                            base = ( p2 = p2.toLowerCase() ) == 'x' ? 16 : p2 == 'b' ? 2 : 8;
                            return !b || b == base ? p1 : m;
                        });

                        if (b) {
                            base = b;

                            // E.g. '1.' to '1', '.1' to '0.1'
                            s = s.replace( dotAfter, '$1' ).replace( dotBefore, '0.$1' );
                        }

                        if ( str != s ) return new BigNumber( s, base );
                    }

                    // 'new BigNumber() not a number: {n}'
                    // 'new BigNumber() not a base {b} number: {n}'
                    if (ERRORS) raise( id, 'not a' + ( b ? ' base ' + b : '' ) + ' number', str );
                    x.s = null;
                }

                x.c = x.e = null;
                id = 0;
            }
        })();


        // Throw a BigNumber Error.
        function raise( caller, msg, val ) {
            var error = new Error( [
                'new BigNumber',     // 0
                'cmp',               // 1
                'config',            // 2
                'div',               // 3
                'divToInt',          // 4
                'eq',                // 5
                'gt',                // 6
                'gte',               // 7
                'lt',                // 8
                'lte',               // 9
                'minus',             // 10
                'mod',               // 11
                'plus',              // 12
                'precision',         // 13
                'random',            // 14
                'round',             // 15
                'shift',             // 16
                'times',             // 17
                'toDigits',          // 18
                'toExponential',     // 19
                'toFixed',           // 20
                'toFormat',          // 21
                'toFraction',        // 22
                'pow',               // 23
                'toPrecision',       // 24
                'toString',          // 25
                'BigNumber'          // 26
            ][caller] + '() ' + msg + ': ' + val );

            error.name = 'BigNumber Error';
            id = 0;
            throw error;
        }


        /*
         * Round x to sd significant digits using rounding mode rm. Check for over/under-flow.
         * If r is truthy, it is known that there are more digits after the rounding digit.
         */
        function round( x, sd, rm, r ) {
            var d, i, j, k, n, ni, rd,
                xc = x.c,
                pows10 = POWS_TEN;

            // if x is not Infinity or NaN...
            if (xc) {

                // rd is the rounding digit, i.e. the digit after the digit that may be rounded up.
                // n is a base 1e14 number, the value of the element of array x.c containing rd.
                // ni is the index of n within x.c.
                // d is the number of digits of n.
                // i is the index of rd within n including leading zeros.
                // j is the actual index of rd within n (if < 0, rd is a leading zero).
                out: {

                    // Get the number of digits of the first element of xc.
                    for ( d = 1, k = xc[0]; k >= 10; k /= 10, d++ );
                    i = sd - d;

                    // If the rounding digit is in the first element of xc...
                    if ( i < 0 ) {
                        i += LOG_BASE;
                        j = sd;
                        n = xc[ ni = 0 ];

                        // Get the rounding digit at index j of n.
                        rd = n / pows10[ d - j - 1 ] % 10 | 0;
                    } else {
                        ni = mathceil( ( i + 1 ) / LOG_BASE );

                        if ( ni >= xc.length ) {

                            if (r) {

                                // Needed by sqrt.
                                for ( ; xc.length <= ni; xc.push(0) );
                                n = rd = 0;
                                d = 1;
                                i %= LOG_BASE;
                                j = i - LOG_BASE + 1;
                            } else {
                                break out;
                            }
                        } else {
                            n = k = xc[ni];

                            // Get the number of digits of n.
                            for ( d = 1; k >= 10; k /= 10, d++ );

                            // Get the index of rd within n.
                            i %= LOG_BASE;

                            // Get the index of rd within n, adjusted for leading zeros.
                            // The number of leading zeros of n is given by LOG_BASE - d.
                            j = i - LOG_BASE + d;

                            // Get the rounding digit at index j of n.
                            rd = j < 0 ? 0 : n / pows10[ d - j - 1 ] % 10 | 0;
                        }
                    }

                    r = r || sd < 0 ||

                    // Are there any non-zero digits after the rounding digit?
                    // The expression  n % pows10[ d - j - 1 ]  returns all digits of n to the right
                    // of the digit at j, e.g. if n is 908714 and j is 2, the expression gives 714.
                      xc[ni + 1] != null || ( j < 0 ? n : n % pows10[ d - j - 1 ] );

                    r = rm < 4
                      ? ( rd || r ) && ( rm == 0 || rm == ( x.s < 0 ? 3 : 2 ) )
                      : rd > 5 || rd == 5 && ( rm == 4 || r || rm == 6 &&

                        // Check whether the digit to the left of the rounding digit is odd.
                        ( ( i > 0 ? j > 0 ? n / pows10[ d - j ] : 0 : xc[ni - 1] ) % 10 ) & 1 ||
                          rm == ( x.s < 0 ? 8 : 7 ) );

                    if ( sd < 1 || !xc[0] ) {
                        xc.length = 0;

                        if (r) {

                            // Convert sd to decimal places.
                            sd -= x.e + 1;

                            // 1, 0.1, 0.01, 0.001, 0.0001 etc.
                            xc[0] = pows10[ sd % LOG_BASE ];
                            x.e = -sd || 0;
                        } else {

                            // Zero.
                            xc[0] = x.e = 0;
                        }

                        return x;
                    }

                    // Remove excess digits.
                    if ( i == 0 ) {
                        xc.length = ni;
                        k = 1;
                        ni--;
                    } else {
                        xc.length = ni + 1;
                        k = pows10[ LOG_BASE - i ];

                        // E.g. 56700 becomes 56000 if 7 is the rounding digit.
                        // j > 0 means i > number of leading zeros of n.
                        xc[ni] = j > 0 ? mathfloor( n / pows10[ d - j ] % pows10[j] ) * k : 0;
                    }

                    // Round up?
                    if (r) {

                        for ( ; ; ) {

                            // If the digit to be rounded up is in the first element of xc...
                            if ( ni == 0 ) {

                                // i will be the length of xc[0] before k is added.
                                for ( i = 1, j = xc[0]; j >= 10; j /= 10, i++ );
                                j = xc[0] += k;
                                for ( k = 1; j >= 10; j /= 10, k++ );

                                // if i != k the length has increased.
                                if ( i != k ) {
                                    x.e++;
                                    if ( xc[0] == BASE ) xc[0] = 1;
                                }

                                break;
                            } else {
                                xc[ni] += k;
                                if ( xc[ni] != BASE ) break;
                                xc[ni--] = 0;
                                k = 1;
                            }
                        }
                    }

                    // Remove trailing zeros.
                    for ( i = xc.length; xc[--i] === 0; xc.pop() );
                }

                // Overflow? Infinity.
                if ( x.e > MAX_EXP ) {
                    x.c = x.e = null;

                // Underflow? Zero.
                } else if ( x.e < MIN_EXP ) {
                    x.c = [ x.e = 0 ];
                }
            }

            return x;
        }


        // PROTOTYPE/INSTANCE METHODS


        /*
         * Return a new BigNumber whose value is the absolute value of this BigNumber.
         */
        P.absoluteValue = P.abs = function () {
            var x = new BigNumber(this);
            if ( x.s < 0 ) x.s = 1;
            return x;
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber rounded to a whole
         * number in the direction of Infinity.
         */
        P.ceil = function () {
            return round( new BigNumber(this), this.e + 1, 2 );
        };


        /*
         * Return
         * 1 if the value of this BigNumber is greater than the value of BigNumber(y, b),
         * -1 if the value of this BigNumber is less than the value of BigNumber(y, b),
         * 0 if they have the same value,
         * or null if the value of either is NaN.
         */
        P.comparedTo = P.cmp = function ( y, b ) {
            id = 1;
            return compare( this, new BigNumber( y, b ) );
        };


        /*
         * Return the number of decimal places of the value of this BigNumber, or null if the value
         * of this BigNumber is ±Infinity or NaN.
         */
        P.decimalPlaces = P.dp = function () {
            var n, v,
                c = this.c;

            if ( !c ) return null;
            n = ( ( v = c.length - 1 ) - bitFloor( this.e / LOG_BASE ) ) * LOG_BASE;

            // Subtract the number of trailing zeros of the last number.
            if ( v = c[v] ) for ( ; v % 10 == 0; v /= 10, n-- );
            if ( n < 0 ) n = 0;

            return n;
        };


        /*
         *  n / 0 = I
         *  n / N = N
         *  n / I = 0
         *  0 / n = 0
         *  0 / 0 = N
         *  0 / N = N
         *  0 / I = 0
         *  N / n = N
         *  N / 0 = N
         *  N / N = N
         *  N / I = N
         *  I / n = I
         *  I / 0 = I
         *  I / N = N
         *  I / I = N
         *
         * Return a new BigNumber whose value is the value of this BigNumber divided by the value of
         * BigNumber(y, b), rounded according to DECIMAL_PLACES and ROUNDING_MODE.
         */
        P.dividedBy = P.div = function ( y, b ) {
            id = 3;
            return div( this, new BigNumber( y, b ), DECIMAL_PLACES, ROUNDING_MODE );
        };


        /*
         * Return a new BigNumber whose value is the integer part of dividing the value of this
         * BigNumber by the value of BigNumber(y, b).
         */
        P.dividedToIntegerBy = P.divToInt = function ( y, b ) {
            id = 4;
            return div( this, new BigNumber( y, b ), 0, 1 );
        };


        /*
         * Return true if the value of this BigNumber is equal to the value of BigNumber(y, b),
         * otherwise returns false.
         */
        P.equals = P.eq = function ( y, b ) {
            id = 5;
            return compare( this, new BigNumber( y, b ) ) === 0;
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber rounded to a whole
         * number in the direction of -Infinity.
         */
        P.floor = function () {
            return round( new BigNumber(this), this.e + 1, 3 );
        };


        /*
         * Return true if the value of this BigNumber is greater than the value of BigNumber(y, b),
         * otherwise returns false.
         */
        P.greaterThan = P.gt = function ( y, b ) {
            id = 6;
            return compare( this, new BigNumber( y, b ) ) > 0;
        };


        /*
         * Return true if the value of this BigNumber is greater than or equal to the value of
         * BigNumber(y, b), otherwise returns false.
         */
        P.greaterThanOrEqualTo = P.gte = function ( y, b ) {
            id = 7;
            return ( b = compare( this, new BigNumber( y, b ) ) ) === 1 || b === 0;

        };


        /*
         * Return true if the value of this BigNumber is a finite number, otherwise returns false.
         */
        P.isFinite = function () {
            return !!this.c;
        };


        /*
         * Return true if the value of this BigNumber is an integer, otherwise return false.
         */
        P.isInteger = P.isInt = function () {
            return !!this.c && bitFloor( this.e / LOG_BASE ) > this.c.length - 2;
        };


        /*
         * Return true if the value of this BigNumber is NaN, otherwise returns false.
         */
        P.isNaN = function () {
            return !this.s;
        };


        /*
         * Return true if the value of this BigNumber is negative, otherwise returns false.
         */
        P.isNegative = P.isNeg = function () {
            return this.s < 0;
        };


        /*
         * Return true if the value of this BigNumber is 0 or -0, otherwise returns false.
         */
        P.isZero = function () {
            return !!this.c && this.c[0] == 0;
        };


        /*
         * Return true if the value of this BigNumber is less than the value of BigNumber(y, b),
         * otherwise returns false.
         */
        P.lessThan = P.lt = function ( y, b ) {
            id = 8;
            return compare( this, new BigNumber( y, b ) ) < 0;
        };


        /*
         * Return true if the value of this BigNumber is less than or equal to the value of
         * BigNumber(y, b), otherwise returns false.
         */
        P.lessThanOrEqualTo = P.lte = function ( y, b ) {
            id = 9;
            return ( b = compare( this, new BigNumber( y, b ) ) ) === -1 || b === 0;
        };


        /*
         *  n - 0 = n
         *  n - N = N
         *  n - I = -I
         *  0 - n = -n
         *  0 - 0 = 0
         *  0 - N = N
         *  0 - I = -I
         *  N - n = N
         *  N - 0 = N
         *  N - N = N
         *  N - I = N
         *  I - n = I
         *  I - 0 = I
         *  I - N = N
         *  I - I = N
         *
         * Return a new BigNumber whose value is the value of this BigNumber minus the value of
         * BigNumber(y, b).
         */
        P.minus = P.sub = function ( y, b ) {
            var i, j, t, xLTy,
                x = this,
                a = x.s;

            id = 10;
            y = new BigNumber( y, b );
            b = y.s;

            // Either NaN?
            if ( !a || !b ) return new BigNumber(NaN);

            // Signs differ?
            if ( a != b ) {
                y.s = -b;
                return x.plus(y);
            }

            var xe = x.e / LOG_BASE,
                ye = y.e / LOG_BASE,
                xc = x.c,
                yc = y.c;

            if ( !xe || !ye ) {

                // Either Infinity?
                if ( !xc || !yc ) return xc ? ( y.s = -b, y ) : new BigNumber( yc ? x : NaN );

                // Either zero?
                if ( !xc[0] || !yc[0] ) {

                    // Return y if y is non-zero, x if x is non-zero, or zero if both are zero.
                    return yc[0] ? ( y.s = -b, y ) : new BigNumber( xc[0] ? x :

                      // IEEE 754 (2008) 6.3: n - n = -0 when rounding to -Infinity
                      ROUNDING_MODE == 3 ? -0 : 0 );
                }
            }

            xe = bitFloor(xe);
            ye = bitFloor(ye);
            xc = xc.slice();

            // Determine which is the bigger number.
            if ( a = xe - ye ) {

                if ( xLTy = a < 0 ) {
                    a = -a;
                    t = xc;
                } else {
                    ye = xe;
                    t = yc;
                }

                t.reverse();

                // Prepend zeros to equalise exponents.
                for ( b = a; b--; t.push(0) );
                t.reverse();
            } else {

                // Exponents equal. Check digit by digit.
                j = ( xLTy = ( a = xc.length ) < ( b = yc.length ) ) ? a : b;

                for ( a = b = 0; b < j; b++ ) {

                    if ( xc[b] != yc[b] ) {
                        xLTy = xc[b] < yc[b];
                        break;
                    }
                }
            }

            // x < y? Point xc to the array of the bigger number.
            if (xLTy) t = xc, xc = yc, yc = t, y.s = -y.s;

            b = ( j = yc.length ) - ( i = xc.length );

            // Append zeros to xc if shorter.
            // No need to add zeros to yc if shorter as subtract only needs to start at yc.length.
            if ( b > 0 ) for ( ; b--; xc[i++] = 0 );
            b = BASE - 1;

            // Subtract yc from xc.
            for ( ; j > a; ) {

                if ( xc[--j] < yc[j] ) {
                    for ( i = j; i && !xc[--i]; xc[i] = b );
                    --xc[i];
                    xc[j] += BASE;
                }

                xc[j] -= yc[j];
            }

            // Remove leading zeros and adjust exponent accordingly.
            for ( ; xc[0] == 0; xc.shift(), --ye );

            // Zero?
            if ( !xc[0] ) {

                // Following IEEE 754 (2008) 6.3,
                // n - n = +0  but  n - n = -0  when rounding towards -Infinity.
                y.s = ROUNDING_MODE == 3 ? -1 : 1;
                y.c = [ y.e = 0 ];
                return y;
            }

            // No need to check for Infinity as +x - +y != Infinity && -x - -y != Infinity
            // for finite x and y.
            return normalise( y, xc, ye );
        };


        /*
         *   n % 0 =  N
         *   n % N =  N
         *   n % I =  n
         *   0 % n =  0
         *  -0 % n = -0
         *   0 % 0 =  N
         *   0 % N =  N
         *   0 % I =  0
         *   N % n =  N
         *   N % 0 =  N
         *   N % N =  N
         *   N % I =  N
         *   I % n =  N
         *   I % 0 =  N
         *   I % N =  N
         *   I % I =  N
         *
         * Return a new BigNumber whose value is the value of this BigNumber modulo the value of
         * BigNumber(y, b). The result depends on the value of MODULO_MODE.
         */
        P.modulo = P.mod = function ( y, b ) {
            var q, s,
                x = this;

            id = 11;
            y = new BigNumber( y, b );

            // Return NaN if x is Infinity or NaN, or y is NaN or zero.
            if ( !x.c || !y.s || y.c && !y.c[0] ) {
                return new BigNumber(NaN);

            // Return x if y is Infinity or x is zero.
            } else if ( !y.c || x.c && !x.c[0] ) {
                return new BigNumber(x);
            }

            if ( MODULO_MODE == 9 ) {

                // Euclidian division: q = sign(y) * floor(x / abs(y))
                // r = x - qy    where  0 <= r < abs(y)
                s = y.s;
                y.s = 1;
                q = div( x, y, 0, 3 );
                y.s = s;
                q.s *= s;
            } else {
                q = div( x, y, 0, MODULO_MODE );
            }

            return x.minus( q.times(y) );
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber negated,
         * i.e. multiplied by -1.
         */
        P.negated = P.neg = function () {
            var x = new BigNumber(this);
            x.s = -x.s || null;
            return x;
        };


        /*
         *  n + 0 = n
         *  n + N = N
         *  n + I = I
         *  0 + n = n
         *  0 + 0 = 0
         *  0 + N = N
         *  0 + I = I
         *  N + n = N
         *  N + 0 = N
         *  N + N = N
         *  N + I = N
         *  I + n = I
         *  I + 0 = I
         *  I + N = N
         *  I + I = I
         *
         * Return a new BigNumber whose value is the value of this BigNumber plus the value of
         * BigNumber(y, b).
         */
        P.plus = P.add = function ( y, b ) {
            var t,
                x = this,
                a = x.s;

            id = 12;
            y = new BigNumber( y, b );
            b = y.s;

            // Either NaN?
            if ( !a || !b ) return new BigNumber(NaN);

            // Signs differ?
             if ( a != b ) {
                y.s = -b;
                return x.minus(y);
            }

            var xe = x.e / LOG_BASE,
                ye = y.e / LOG_BASE,
                xc = x.c,
                yc = y.c;

            if ( !xe || !ye ) {

                // Return ±Infinity if either ±Infinity.
                if ( !xc || !yc ) return new BigNumber( a / 0 );

                // Either zero?
                // Return y if y is non-zero, x if x is non-zero, or zero if both are zero.
                if ( !xc[0] || !yc[0] ) return yc[0] ? y : new BigNumber( xc[0] ? x : a * 0 );
            }

            xe = bitFloor(xe);
            ye = bitFloor(ye);
            xc = xc.slice();

            // Prepend zeros to equalise exponents. Faster to use reverse then do unshifts.
            if ( a = xe - ye ) {
                if ( a > 0 ) {
                    ye = xe;
                    t = yc;
                } else {
                    a = -a;
                    t = xc;
                }

                t.reverse();
                for ( ; a--; t.push(0) );
                t.reverse();
            }

            a = xc.length;
            b = yc.length;

            // Point xc to the longer array, and b to the shorter length.
            if ( a - b < 0 ) t = yc, yc = xc, xc = t, b = a;

            // Only start adding at yc.length - 1 as the further digits of xc can be ignored.
            for ( a = 0; b; ) {
                a = ( xc[--b] = xc[b] + yc[b] + a ) / BASE | 0;
                xc[b] %= BASE;
            }

            if (a) {
                xc.unshift(a);
                ++ye;
            }

            // No need to check for zero, as +x + +y != 0 && -x + -y != 0
            // ye = MAX_EXP + 1 possible
            return normalise( y, xc, ye );
        };


        /*
         * Return the number of significant digits of the value of this BigNumber.
         *
         * [z] {boolean|number} Whether to count integer-part trailing zeros: true, false, 1 or 0.
         */
        P.precision = P.sd = function (z) {
            var n, v,
                x = this,
                c = x.c;

            // 'precision() argument not a boolean or binary digit: {z}'
            if ( z != null && z !== !!z && z !== 1 && z !== 0 ) {
                if (ERRORS) raise( 13, 'argument' + notBool, z );
                if ( z != !!z ) z = null;
            }

            if ( !c ) return null;
            v = c.length - 1;
            n = v * LOG_BASE + 1;

            if ( v = c[v] ) {

                // Subtract the number of trailing zeros of the last element.
                for ( ; v % 10 == 0; v /= 10, n-- );

                // Add the number of digits of the first element.
                for ( v = c[0]; v >= 10; v /= 10, n++ );
            }

            if ( z && x.e + 1 > n ) n = x.e + 1;

            return n;
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber rounded to a maximum of
         * dp decimal places using rounding mode rm, or to 0 and ROUNDING_MODE respectively if
         * omitted.
         *
         * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
         * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
         *
         * 'round() decimal places out of range: {dp}'
         * 'round() decimal places not an integer: {dp}'
         * 'round() rounding mode not an integer: {rm}'
         * 'round() rounding mode out of range: {rm}'
         */
        P.round = function ( dp, rm ) {
            var n = new BigNumber(this);

            if ( dp == null || isValidInt( dp, 0, MAX, 15 ) ) {
                round( n, ~~dp + this.e + 1, rm == null ||
                  !isValidInt( rm, 0, 8, 15, roundingMode ) ? ROUNDING_MODE : rm | 0 );
            }

            return n;
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber shifted by k places
         * (powers of 10). Shift to the right if n > 0, and to the left if n < 0.
         *
         * k {number} Integer, -MAX_SAFE_INTEGER to MAX_SAFE_INTEGER inclusive.
         *
         * If k is out of range and ERRORS is false, the result will be ±0 if k < 0, or ±Infinity
         * otherwise.
         *
         * 'shift() argument not an integer: {k}'
         * 'shift() argument out of range: {k}'
         */
        P.shift = function (k) {
            var n = this;
            return isValidInt( k, -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER, 16, 'argument' )

              // k < 1e+21, or truncate(k) will produce exponential notation.
              ? n.times( '1e' + truncate(k) )
              : new BigNumber( n.c && n.c[0] && ( k < -MAX_SAFE_INTEGER || k > MAX_SAFE_INTEGER )
                ? n.s * ( k < 0 ? 0 : 1 / 0 )
                : n );
        };


        /*
         *  sqrt(-n) =  N
         *  sqrt( N) =  N
         *  sqrt(-I) =  N
         *  sqrt( I) =  I
         *  sqrt( 0) =  0
         *  sqrt(-0) = -0
         *
         * Return a new BigNumber whose value is the square root of the value of this BigNumber,
         * rounded according to DECIMAL_PLACES and ROUNDING_MODE.
         */
        P.squareRoot = P.sqrt = function () {
            var m, n, r, rep, t,
                x = this,
                c = x.c,
                s = x.s,
                e = x.e,
                dp = DECIMAL_PLACES + 4,
                half = new BigNumber('0.5');

            // Negative/NaN/Infinity/zero?
            if ( s !== 1 || !c || !c[0] ) {
                return new BigNumber( !s || s < 0 && ( !c || c[0] ) ? NaN : c ? x : 1 / 0 );
            }

            // Initial estimate.
            s = Math.sqrt( +x );

            // Math.sqrt underflow/overflow?
            // Pass x to Math.sqrt as integer, then adjust the exponent of the result.
            if ( s == 0 || s == 1 / 0 ) {
                n = coeffToString(c);
                if ( ( n.length + e ) % 2 == 0 ) n += '0';
                s = Math.sqrt(n);
                e = bitFloor( ( e + 1 ) / 2 ) - ( e < 0 || e % 2 );

                if ( s == 1 / 0 ) {
                    n = '1e' + e;
                } else {
                    n = s.toExponential();
                    n = n.slice( 0, n.indexOf('e') + 1 ) + e;
                }

                r = new BigNumber(n);
            } else {
                r = new BigNumber( s + '' );
            }

            // Check for zero.
            // r could be zero if MIN_EXP is changed after the this value was created.
            // This would cause a division by zero (x/t) and hence Infinity below, which would cause
            // coeffToString to throw.
            if ( r.c[0] ) {
                e = r.e;
                s = e + dp;
                if ( s < 3 ) s = 0;

                // Newton-Raphson iteration.
                for ( ; ; ) {
                    t = r;
                    r = half.times( t.plus( div( x, t, dp, 1 ) ) );

                    if ( coeffToString( t.c   ).slice( 0, s ) === ( n =
                         coeffToString( r.c ) ).slice( 0, s ) ) {

                        // The exponent of r may here be one less than the final result exponent,
                        // e.g 0.0009999 (e-4) --> 0.001 (e-3), so adjust s so the rounding digits
                        // are indexed correctly.
                        if ( r.e < e ) --s;
                        n = n.slice( s - 3, s + 1 );

                        // The 4th rounding digit may be in error by -1 so if the 4 rounding digits
                        // are 9999 or 4999 (i.e. approaching a rounding boundary) continue the
                        // iteration.
                        if ( n == '9999' || !rep && n == '4999' ) {

                            // On the first iteration only, check to see if rounding up gives the
                            // exact result as the nines may infinitely repeat.
                            if ( !rep ) {
                                round( t, t.e + DECIMAL_PLACES + 2, 0 );

                                if ( t.times(t).eq(x) ) {
                                    r = t;
                                    break;
                                }
                            }

                            dp += 4;
                            s += 4;
                            rep = 1;
                        } else {

                            // If rounding digits are null, 0{0,4} or 50{0,3}, check for exact
                            // result. If not, then there are further digits and m will be truthy.
                            if ( !+n || !+n.slice(1) && n.charAt(0) == '5' ) {

                                // Truncate to the first rounding digit.
                                round( r, r.e + DECIMAL_PLACES + 2, 1 );
                                m = !r.times(r).eq(x);
                            }

                            break;
                        }
                    }
                }
            }

            return round( r, r.e + DECIMAL_PLACES + 1, ROUNDING_MODE, m );
        };


        /*
         *  n * 0 = 0
         *  n * N = N
         *  n * I = I
         *  0 * n = 0
         *  0 * 0 = 0
         *  0 * N = N
         *  0 * I = N
         *  N * n = N
         *  N * 0 = N
         *  N * N = N
         *  N * I = N
         *  I * n = I
         *  I * 0 = N
         *  I * N = N
         *  I * I = I
         *
         * Return a new BigNumber whose value is the value of this BigNumber times the value of
         * BigNumber(y, b).
         */
        P.times = P.mul = function ( y, b ) {
            var c, e, i, j, k, m, xcL, xlo, xhi, ycL, ylo, yhi, zc,
                base, sqrtBase,
                x = this,
                xc = x.c,
                yc = ( id = 17, y = new BigNumber( y, b ) ).c;

            // Either NaN, ±Infinity or ±0?
            if ( !xc || !yc || !xc[0] || !yc[0] ) {

                // Return NaN if either is NaN, or one is 0 and the other is Infinity.
                if ( !x.s || !y.s || xc && !xc[0] && !yc || yc && !yc[0] && !xc ) {
                    y.c = y.e = y.s = null;
                } else {
                    y.s *= x.s;

                    // Return ±Infinity if either is ±Infinity.
                    if ( !xc || !yc ) {
                        y.c = y.e = null;

                    // Return ±0 if either is ±0.
                    } else {
                        y.c = [0];
                        y.e = 0;
                    }
                }

                return y;
            }

            e = bitFloor( x.e / LOG_BASE ) + bitFloor( y.e / LOG_BASE );
            y.s *= x.s;
            xcL = xc.length;
            ycL = yc.length;

            // Ensure xc points to longer array and xcL to its length.
            if ( xcL < ycL ) zc = xc, xc = yc, yc = zc, i = xcL, xcL = ycL, ycL = i;

            // Initialise the result array with zeros.
            for ( i = xcL + ycL, zc = []; i--; zc.push(0) );

            base = BASE;
            sqrtBase = SQRT_BASE;

            for ( i = ycL; --i >= 0; ) {
                c = 0;
                ylo = yc[i] % sqrtBase;
                yhi = yc[i] / sqrtBase | 0;

                for ( k = xcL, j = i + k; j > i; ) {
                    xlo = xc[--k] % sqrtBase;
                    xhi = xc[k] / sqrtBase | 0;
                    m = yhi * xlo + xhi * ylo;
                    xlo = ylo * xlo + ( ( m % sqrtBase ) * sqrtBase ) + zc[j] + c;
                    c = ( xlo / base | 0 ) + ( m / sqrtBase | 0 ) + yhi * xhi;
                    zc[j--] = xlo % base;
                }

                zc[j] = c;
            }

            if (c) {
                ++e;
            } else {
                zc.shift();
            }

            return normalise( y, zc, e );
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber rounded to a maximum of
         * sd significant digits using rounding mode rm, or ROUNDING_MODE if rm is omitted.
         *
         * [sd] {number} Significant digits. Integer, 1 to MAX inclusive.
         * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
         *
         * 'toDigits() precision out of range: {sd}'
         * 'toDigits() precision not an integer: {sd}'
         * 'toDigits() rounding mode not an integer: {rm}'
         * 'toDigits() rounding mode out of range: {rm}'
         */
        P.toDigits = function ( sd, rm ) {
            var n = new BigNumber(this);
            sd = sd == null || !isValidInt( sd, 1, MAX, 18, 'precision' ) ? null : sd | 0;
            rm = rm == null || !isValidInt( rm, 0, 8, 18, roundingMode ) ? ROUNDING_MODE : rm | 0;
            return sd ? round( n, sd, rm ) : n;
        };


        /*
         * Return a string representing the value of this BigNumber in exponential notation and
         * rounded using ROUNDING_MODE to dp fixed decimal places.
         *
         * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
         * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
         *
         * 'toExponential() decimal places not an integer: {dp}'
         * 'toExponential() decimal places out of range: {dp}'
         * 'toExponential() rounding mode not an integer: {rm}'
         * 'toExponential() rounding mode out of range: {rm}'
         */
        P.toExponential = function ( dp, rm ) {
            return format( this,
              dp != null && isValidInt( dp, 0, MAX, 19 ) ? ~~dp + 1 : null, rm, 19 );
        };


        /*
         * Return a string representing the value of this BigNumber in fixed-point notation rounding
         * to dp fixed decimal places using rounding mode rm, or ROUNDING_MODE if rm is omitted.
         *
         * Note: as with JavaScript's number type, (-0).toFixed(0) is '0',
         * but e.g. (-0.00001).toFixed(0) is '-0'.
         *
         * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
         * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
         *
         * 'toFixed() decimal places not an integer: {dp}'
         * 'toFixed() decimal places out of range: {dp}'
         * 'toFixed() rounding mode not an integer: {rm}'
         * 'toFixed() rounding mode out of range: {rm}'
         */
        P.toFixed = function ( dp, rm ) {
            return format( this, dp != null && isValidInt( dp, 0, MAX, 20 )
              ? ~~dp + this.e + 1 : null, rm, 20 );
        };


        /*
         * Return a string representing the value of this BigNumber in fixed-point notation rounded
         * using rm or ROUNDING_MODE to dp decimal places, and formatted according to the properties
         * of the FORMAT object (see BigNumber.config).
         *
         * FORMAT = {
         *      decimalSeparator : '.',
         *      groupSeparator : ',',
         *      groupSize : 3,
         *      secondaryGroupSize : 0,
         *      fractionGroupSeparator : '\xA0',    // non-breaking space
         *      fractionGroupSize : 0
         * };
         *
         * [dp] {number} Decimal places. Integer, 0 to MAX inclusive.
         * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
         *
         * 'toFormat() decimal places not an integer: {dp}'
         * 'toFormat() decimal places out of range: {dp}'
         * 'toFormat() rounding mode not an integer: {rm}'
         * 'toFormat() rounding mode out of range: {rm}'
         */
        P.toFormat = function ( dp, rm ) {
            var str = format( this, dp != null && isValidInt( dp, 0, MAX, 21 )
              ? ~~dp + this.e + 1 : null, rm, 21 );

            if ( this.c ) {
                var i,
                    arr = str.split('.'),
                    g1 = +FORMAT.groupSize,
                    g2 = +FORMAT.secondaryGroupSize,
                    groupSeparator = FORMAT.groupSeparator,
                    intPart = arr[0],
                    fractionPart = arr[1],
                    isNeg = this.s < 0,
                    intDigits = isNeg ? intPart.slice(1) : intPart,
                    len = intDigits.length;

                if (g2) i = g1, g1 = g2, g2 = i, len -= i;

                if ( g1 > 0 && len > 0 ) {
                    i = len % g1 || g1;
                    intPart = intDigits.substr( 0, i );

                    for ( ; i < len; i += g1 ) {
                        intPart += groupSeparator + intDigits.substr( i, g1 );
                    }

                    if ( g2 > 0 ) intPart += groupSeparator + intDigits.slice(i);
                    if (isNeg) intPart = '-' + intPart;
                }

                str = fractionPart
                  ? intPart + FORMAT.decimalSeparator + ( ( g2 = +FORMAT.fractionGroupSize )
                    ? fractionPart.replace( new RegExp( '\\d{' + g2 + '}\\B', 'g' ),
                      '$&' + FORMAT.fractionGroupSeparator )
                    : fractionPart )
                  : intPart;
            }

            return str;
        };


        /*
         * Return a string array representing the value of this BigNumber as a simple fraction with
         * an integer numerator and an integer denominator. The denominator will be a positive
         * non-zero value less than or equal to the specified maximum denominator. If a maximum
         * denominator is not specified, the denominator will be the lowest value necessary to
         * represent the number exactly.
         *
         * [md] {number|string|BigNumber} Integer >= 1 and < Infinity. The maximum denominator.
         *
         * 'toFraction() max denominator not an integer: {md}'
         * 'toFraction() max denominator out of range: {md}'
         */
        P.toFraction = function (md) {
            var arr, d0, d2, e, exp, n, n0, q, s,
                k = ERRORS,
                x = this,
                xc = x.c,
                d = new BigNumber(ONE),
                n1 = d0 = new BigNumber(ONE),
                d1 = n0 = new BigNumber(ONE);

            if ( md != null ) {
                ERRORS = false;
                n = new BigNumber(md);
                ERRORS = k;

                if ( !( k = n.isInt() ) || n.lt(ONE) ) {

                    if (ERRORS) {
                        raise( 22,
                          'max denominator ' + ( k ? 'out of range' : 'not an integer' ), md );
                    }

                    // ERRORS is false:
                    // If md is a finite non-integer >= 1, round it to an integer and use it.
                    md = !k && n.c && round( n, n.e + 1, 1 ).gte(ONE) ? n : null;
                }
            }

            if ( !xc ) return x.toString();
            s = coeffToString(xc);

            // Determine initial denominator.
            // d is a power of 10 and the minimum max denominator that specifies the value exactly.
            e = d.e = s.length - x.e - 1;
            d.c[0] = POWS_TEN[ ( exp = e % LOG_BASE ) < 0 ? LOG_BASE + exp : exp ];
            md = !md || n.cmp(d) > 0 ? ( e > 0 ? d : n1 ) : n;

            exp = MAX_EXP;
            MAX_EXP = 1 / 0;
            n = new BigNumber(s);

            // n0 = d1 = 0
            n0.c[0] = 0;

            for ( ; ; )  {
                q = div( n, d, 0, 1 );
                d2 = d0.plus( q.times(d1) );
                if ( d2.cmp(md) == 1 ) break;
                d0 = d1;
                d1 = d2;
                n1 = n0.plus( q.times( d2 = n1 ) );
                n0 = d2;
                d = n.minus( q.times( d2 = d ) );
                n = d2;
            }

            d2 = div( md.minus(d0), d1, 0, 1 );
            n0 = n0.plus( d2.times(n1) );
            d0 = d0.plus( d2.times(d1) );
            n0.s = n1.s = x.s;
            e *= 2;

            // Determine which fraction is closer to x, n0/d0 or n1/d1
            arr = div( n1, d1, e, ROUNDING_MODE ).minus(x).abs().cmp(
                  div( n0, d0, e, ROUNDING_MODE ).minus(x).abs() ) < 1
                    ? [ n1.toString(), d1.toString() ]
                    : [ n0.toString(), d0.toString() ];

            MAX_EXP = exp;
            return arr;
        };


        /*
         * Return the value of this BigNumber converted to a number primitive.
         */
        P.toNumber = function () {
            var x = this;

            // Ensure zero has correct sign.
            return +x || ( x.s ? x.s * 0 : NaN );
        };


        /*
         * Return a BigNumber whose value is the value of this BigNumber raised to the power n.
         * If n is negative round according to DECIMAL_PLACES and ROUNDING_MODE.
         * If POW_PRECISION is not 0, round to POW_PRECISION using ROUNDING_MODE.
         *
         * n {number} Integer, -9007199254740992 to 9007199254740992 inclusive.
         * (Performs 54 loop iterations for n of 9007199254740992.)
         *
         * 'pow() exponent not an integer: {n}'
         * 'pow() exponent out of range: {n}'
         */
        P.toPower = P.pow = function (n) {
            var k, y,
                i = mathfloor( n < 0 ? -n : +n ),
                x = this;

            // Pass ±Infinity to Math.pow if exponent is out of range.
            if ( !isValidInt( n, -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER, 23, 'exponent' ) &&
              ( !isFinite(n) || i > MAX_SAFE_INTEGER && ( n /= 0 ) ||
                parseFloat(n) != n && !( n = NaN ) ) ) {
                return new BigNumber( Math.pow( +x, n ) );
            }

            // Truncating each coefficient array to a length of k after each multiplication equates
            // to truncating significant digits to POW_PRECISION + [28, 41], i.e. there will be a
            // minimum of 28 guard digits retained. (Using + 1.5 would give [9, 21] guard digits.)
            k = POW_PRECISION ? mathceil( POW_PRECISION / LOG_BASE + 2 ) : 0;
            y = new BigNumber(ONE);

            for ( ; ; ) {

                if ( i % 2 ) {
                    y = y.times(x);
                    if ( !y.c ) break;
                    if ( k && y.c.length > k ) y.c.length = k;
                }

                i = mathfloor( i / 2 );
                if ( !i ) break;

                x = x.times(x);
                if ( k && x.c && x.c.length > k ) x.c.length = k;
            }

            if ( n < 0 ) y = ONE.div(y);
            return k ? round( y, POW_PRECISION, ROUNDING_MODE ) : y;
        };


        /*
         * Return a string representing the value of this BigNumber rounded to sd significant digits
         * using rounding mode rm or ROUNDING_MODE. If sd is less than the number of digits
         * necessary to represent the integer part of the value in fixed-point notation, then use
         * exponential notation.
         *
         * [sd] {number} Significant digits. Integer, 1 to MAX inclusive.
         * [rm] {number} Rounding mode. Integer, 0 to 8 inclusive.
         *
         * 'toPrecision() precision not an integer: {sd}'
         * 'toPrecision() precision out of range: {sd}'
         * 'toPrecision() rounding mode not an integer: {rm}'
         * 'toPrecision() rounding mode out of range: {rm}'
         */
        P.toPrecision = function ( sd, rm ) {
            return format( this, sd != null && isValidInt( sd, 1, MAX, 24, 'precision' )
              ? sd | 0 : null, rm, 24 );
        };


        /*
         * Return a string representing the value of this BigNumber in base b, or base 10 if b is
         * omitted. If a base is specified, including base 10, round according to DECIMAL_PLACES and
         * ROUNDING_MODE. If a base is not specified, and this BigNumber has a positive exponent
         * that is equal to or greater than TO_EXP_POS, or a negative exponent equal to or less than
         * TO_EXP_NEG, return exponential notation.
         *
         * [b] {number} Integer, 2 to 64 inclusive.
         *
         * 'toString() base not an integer: {b}'
         * 'toString() base out of range: {b}'
         */
        P.toString = function (b) {
            var str,
                n = this,
                s = n.s,
                e = n.e;

            // Infinity or NaN?
            if ( e === null ) {

                if (s) {
                    str = 'Infinity';
                    if ( s < 0 ) str = '-' + str;
                } else {
                    str = 'NaN';
                }
            } else {
                str = coeffToString( n.c );

                if ( b == null || !isValidInt( b, 2, 64, 25, 'base' ) ) {
                    str = e <= TO_EXP_NEG || e >= TO_EXP_POS
                      ? toExponential( str, e )
                      : toFixedPoint( str, e );
                } else {
                    str = convertBase( toFixedPoint( str, e ), b | 0, 10, s );
                }

                if ( s < 0 && n.c[0] ) str = '-' + str;
            }

            return str;
        };


        /*
         * Return a new BigNumber whose value is the value of this BigNumber truncated to a whole
         * number.
         */
        P.truncated = P.trunc = function () {
            return round( new BigNumber(this), this.e + 1, 1 );
        };



        /*
         * Return as toString, but do not accept a base argument.
         */
        P.valueOf = P.toJSON = function () {
            return this.toString();
        };


        // Aliases for BigDecimal methods.
        //P.add = P.plus;         // P.add included above
        //P.subtract = P.minus;   // P.sub included above
        //P.multiply = P.times;   // P.mul included above
        //P.divide = P.div;
        //P.remainder = P.mod;
        //P.compareTo = P.cmp;
        //P.negate = P.neg;


        if ( configObj != null ) BigNumber.config(configObj);

        return BigNumber;
    }


    // PRIVATE HELPER FUNCTIONS


    function bitFloor(n) {
        var i = n | 0;
        return n > 0 || n === i ? i : i - 1;
    }


    // Return a coefficient array as a string of base 10 digits.
    function coeffToString(a) {
        var s, z,
            i = 1,
            j = a.length,
            r = a[0] + '';

        for ( ; i < j; ) {
            s = a[i++] + '';
            z = LOG_BASE - s.length;
            for ( ; z--; s = '0' + s );
            r += s;
        }

        // Determine trailing zeros.
        for ( j = r.length; r.charCodeAt(--j) === 48; );
        return r.slice( 0, j + 1 || 1 );
    }


    // Compare the value of BigNumbers x and y.
    function compare( x, y ) {
        var a, b,
            xc = x.c,
            yc = y.c,
            i = x.s,
            j = y.s,
            k = x.e,
            l = y.e;

        // Either NaN?
        if ( !i || !j ) return null;

        a = xc && !xc[0];
        b = yc && !yc[0];

        // Either zero?
        if ( a || b ) return a ? b ? 0 : -j : i;

        // Signs differ?
        if ( i != j ) return i;

        a = i < 0;
        b = k == l;

        // Either Infinity?
        if ( !xc || !yc ) return b ? 0 : !xc ^ a ? 1 : -1;

        // Compare exponents.
        if ( !b ) return k > l ^ a ? 1 : -1;

        j = ( k = xc.length ) < ( l = yc.length ) ? k : l;

        // Compare digit by digit.
        for ( i = 0; i < j; i++ ) if ( xc[i] != yc[i] ) return xc[i] > yc[i] ^ a ? 1 : -1;

        // Compare lengths.
        return k == l ? 0 : k > l ^ a ? 1 : -1;
    }


    /*
     * Return true if n is a valid number in range, otherwise false.
     * Use for argument validation when ERRORS is false.
     * Note: parseInt('1e+1') == 1 but parseFloat('1e+1') == 10.
     */
    function intValidatorNoErrors( n, min, max ) {
        return ( n = truncate(n) ) >= min && n <= max;
    }


    function isArray(obj) {
        return Object.prototype.toString.call(obj) == '[object Array]';
    }


    /*
     * Convert string of baseIn to an array of numbers of baseOut.
     * Eg. convertBase('255', 10, 16) returns [15, 15].
     * Eg. convertBase('ff', 16, 10) returns [2, 5, 5].
     */
    function toBaseOut( str, baseIn, baseOut ) {
        var j,
            arr = [0],
            arrL,
            i = 0,
            len = str.length;

        for ( ; i < len; ) {
            for ( arrL = arr.length; arrL--; arr[arrL] *= baseIn );
            arr[ j = 0 ] += ALPHABET.indexOf( str.charAt( i++ ) );

            for ( ; j < arr.length; j++ ) {

                if ( arr[j] > baseOut - 1 ) {
                    if ( arr[j + 1] == null ) arr[j + 1] = 0;
                    arr[j + 1] += arr[j] / baseOut | 0;
                    arr[j] %= baseOut;
                }
            }
        }

        return arr.reverse();
    }


    function toExponential( str, e ) {
        return ( str.length > 1 ? str.charAt(0) + '.' + str.slice(1) : str ) +
          ( e < 0 ? 'e' : 'e+' ) + e;
    }


    function toFixedPoint( str, e ) {
        var len, z;

        // Negative exponent?
        if ( e < 0 ) {

            // Prepend zeros.
            for ( z = '0.'; ++e; z += '0' );
            str = z + str;

        // Positive exponent
        } else {
            len = str.length;

            // Append zeros.
            if ( ++e > len ) {
                for ( z = '0', e -= len; --e; z += '0' );
                str += z;
            } else if ( e < len ) {
                str = str.slice( 0, e ) + '.' + str.slice(e);
            }
        }

        return str;
    }


    function truncate(n) {
        n = parseFloat(n);
        return n < 0 ? mathceil(n) : mathfloor(n);
    }


    // EXPORT


    BigNumber = another();

    // AMD.
    if ( typeof define == 'function' && define.amd ) {
        define( function () { return BigNumber; } );

    // Node and other environments that support module.exports.
    } else if ( typeof module != 'undefined' && module.exports ) {
        module.exports = BigNumber;
        if ( !crypto ) try { crypto = require('crypto'); } catch (e) {}

    // Browser.
    } else {
        global.BigNumber = BigNumber;
    }
})(this);

},{"crypto":31}],"web3":[function(require,module,exports){
var web3 = require('./lib/web3');
web3.providers.HttpProvider = require('./lib/web3/httpprovider');
web3.providers.QtSyncProvider = require('./lib/web3/qtsync');
web3.eth.contract = require('./lib/web3/contract');
web3.eth.namereg = require('./lib/web3/namereg');
web3.eth.sendIBANTransaction = require('./lib/web3/transfer');

// dont override global variable
if (typeof window !== 'undefined' && typeof window.web3 === 'undefined') {
    window.web3 = web3;
}

module.exports = web3;


},{"./lib/web3":9,"./lib/web3/contract":11,"./lib/web3/httpprovider":19,"./lib/web3/namereg":23,"./lib/web3/qtsync":26,"./lib/web3/transfer":29}]},{},["web3"])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvc29saWRpdHkvY29kZXIuanMiLCJsaWIvc29saWRpdHkvZm9ybWF0dGVycy5qcyIsImxpYi9zb2xpZGl0eS9wYXJhbS5qcyIsImxpYi91dGlscy9icm93c2VyLXhoci5qcyIsImxpYi91dGlscy9jb25maWcuanMiLCJsaWIvdXRpbHMvc2hhMy5qcyIsImxpYi91dGlscy91dGlscy5qcyIsImxpYi92ZXJzaW9uLmpzb24iLCJsaWIvd2ViMy5qcyIsImxpYi93ZWIzL2JhdGNoLmpzIiwibGliL3dlYjMvY29udHJhY3QuanMiLCJsaWIvd2ViMy9kYi5qcyIsImxpYi93ZWIzL2Vycm9ycy5qcyIsImxpYi93ZWIzL2V0aC5qcyIsImxpYi93ZWIzL2V2ZW50LmpzIiwibGliL3dlYjMvZmlsdGVyLmpzIiwibGliL3dlYjMvZm9ybWF0dGVycy5qcyIsImxpYi93ZWIzL2Z1bmN0aW9uLmpzIiwibGliL3dlYjMvaHR0cHByb3ZpZGVyLmpzIiwibGliL3dlYjMvaWNhcC5qcyIsImxpYi93ZWIzL2pzb25ycGMuanMiLCJsaWIvd2ViMy9tZXRob2QuanMiLCJsaWIvd2ViMy9uYW1lcmVnLmpzIiwibGliL3dlYjMvbmV0LmpzIiwibGliL3dlYjMvcHJvcGVydHkuanMiLCJsaWIvd2ViMy9xdHN5bmMuanMiLCJsaWIvd2ViMy9yZXF1ZXN0bWFuYWdlci5qcyIsImxpYi93ZWIzL3NoaC5qcyIsImxpYi93ZWIzL3RyYW5zZmVyLmpzIiwibGliL3dlYjMvd2F0Y2hlcy5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L2xpYi9fZW1wdHkuanMiLCJub2RlX21vZHVsZXMvY3J5cHRvLWpzL2NvcmUuanMiLCJub2RlX21vZHVsZXMvY3J5cHRvLWpzL3NoYTMuanMiLCJub2RlX21vZHVsZXMvY3J5cHRvLWpzL3g2NC1jb3JlLmpzIiwiYmlnbnVtYmVyLmpzIiwiaW5kZXguanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsZkE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDblJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25NQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDak9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xIQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNydUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9TQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNuRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIFxuICogQGZpbGUgY29kZXIuanNcbiAqIEBhdXRob3IgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiBAZGF0ZSAyMDE1XG4gKi9cblxudmFyIEJpZ051bWJlciA9IHJlcXVpcmUoJ2JpZ251bWJlci5qcycpO1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcbnZhciBmID0gcmVxdWlyZSgnLi9mb3JtYXR0ZXJzJyk7XG52YXIgU29saWRpdHlQYXJhbSA9IHJlcXVpcmUoJy4vcGFyYW0nKTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBjaGVjayBpZiBhIHR5cGUgaXMgYW4gYXJyYXkgdHlwZVxuICpcbiAqIEBtZXRob2QgaXNBcnJheVR5cGVcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlXG4gKiBAcmV0dXJuIHtCb29sfSB0cnVlIGlzIHRoZSB0eXBlIGlzIGFuIGFycmF5LCBvdGhlcndpc2UgZmFsc2VcbiAqL1xudmFyIGlzQXJyYXlUeXBlID0gZnVuY3Rpb24gKHR5cGUpIHtcbiAgICByZXR1cm4gdHlwZS5zbGljZSgtMikgPT09ICdbXSc7XG59O1xuXG4vKipcbiAqIFNvbGlkaXR5VHlwZSBwcm90b3R5cGUgaXMgdXNlZCB0byBlbmNvZGUvZGVjb2RlIHNvbGlkaXR5IHBhcmFtcyBvZiBjZXJ0YWluIHR5cGVcbiAqL1xudmFyIFNvbGlkaXR5VHlwZSA9IGZ1bmN0aW9uIChjb25maWcpIHtcbiAgICB0aGlzLl9uYW1lID0gY29uZmlnLm5hbWU7XG4gICAgdGhpcy5fbWF0Y2ggPSBjb25maWcubWF0Y2g7XG4gICAgdGhpcy5fbW9kZSA9IGNvbmZpZy5tb2RlO1xuICAgIHRoaXMuX2lucHV0Rm9ybWF0dGVyID0gY29uZmlnLmlucHV0Rm9ybWF0dGVyO1xuICAgIHRoaXMuX291dHB1dEZvcm1hdHRlciA9IGNvbmZpZy5vdXRwdXRGb3JtYXR0ZXI7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGRldGVybWluZSBpZiB0aGlzIFNvbGlkaXR5VHlwZSBkbyBtYXRjaCBnaXZlbiB0eXBlXG4gKlxuICogQG1ldGhvZCBpc1R5cGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAcmV0dXJuIHtCb29sfSB0cnVlIGlmIHR5cGUgbWF0Y2ggdGhpcyBTb2xpZGl0eVR5cGUsIG90aGVyd2lzZSBmYWxzZVxuICovXG5Tb2xpZGl0eVR5cGUucHJvdG90eXBlLmlzVHlwZSA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgaWYgKHRoaXMuX21hdGNoID09PSAnc3RyaWN0Jykge1xuICAgICAgICByZXR1cm4gdGhpcy5fbmFtZSA9PT0gbmFtZSB8fCAobmFtZS5pbmRleE9mKHRoaXMuX25hbWUpID09PSAwICYmIG5hbWUuc2xpY2UodGhpcy5fbmFtZS5sZW5ndGgpID09PSAnW10nKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuX21hdGNoID09PSAncHJlZml4Jykge1xuICAgICAgICAvLyBUT0RPIGJldHRlciB0eXBlIGRldGVjdGlvbiFcbiAgICAgICAgcmV0dXJuIG5hbWUuaW5kZXhPZih0aGlzLl9uYW1lKSA9PT0gMDtcbiAgICB9XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIHRyYW5zZm9ybSBwbGFpbiBwYXJhbSB0byBTb2xpZGl0eVBhcmFtIG9iamVjdFxuICpcbiAqIEBtZXRob2QgZm9ybWF0SW5wdXRcbiAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbSAtIHBsYWluIG9iamVjdCwgb3IgYW4gYXJyYXkgb2Ygb2JqZWN0c1xuICogQHBhcmFtIHtCb29sfSBhcnJheVR5cGUgLSB0cnVlIGlmIGEgcGFyYW0gc2hvdWxkIGJlIGVuY29kZWQgYXMgYW4gYXJyYXlcbiAqIEByZXR1cm4ge1NvbGlkaXR5UGFyYW19IGVuY29kZWQgcGFyYW0gd3JhcHBlZCBpbiBTb2xpZGl0eVBhcmFtIG9iamVjdCBcbiAqL1xuU29saWRpdHlUeXBlLnByb3RvdHlwZS5mb3JtYXRJbnB1dCA9IGZ1bmN0aW9uIChwYXJhbSwgYXJyYXlUeXBlKSB7XG4gICAgaWYgKHV0aWxzLmlzQXJyYXkocGFyYW0pICYmIGFycmF5VHlwZSkgeyAvLyBUT0RPOiBzaG91bGQgZmFpbCBpZiB0aGlzIHR3byBhcmUgbm90IHRoZSBzYW1lXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgcmV0dXJuIHBhcmFtLm1hcChmdW5jdGlvbiAocCkge1xuICAgICAgICAgICAgcmV0dXJuIHNlbGYuX2lucHV0Rm9ybWF0dGVyKHApO1xuICAgICAgICB9KS5yZWR1Y2UoZnVuY3Rpb24gKGFjYywgY3VycmVudCkge1xuICAgICAgICAgICAgcmV0dXJuIGFjYy5jb21iaW5lKGN1cnJlbnQpO1xuICAgICAgICB9LCBmLmZvcm1hdElucHV0SW50KHBhcmFtLmxlbmd0aCkpLndpdGhPZmZzZXQoMzIpO1xuICAgIH0gXG4gICAgcmV0dXJuIHRoaXMuX2lucHV0Rm9ybWF0dGVyKHBhcmFtKTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gdHJhbnNvZm9ybSBTb2xpZGl0eVBhcmFtIHRvIHBsYWluIHBhcmFtXG4gKlxuICogQG1ldGhvZCBmb3JtYXRPdXRwdXRcbiAqIEBwYXJhbSB7U29saWRpdHlQYXJhbX0gYnl0ZUFycmF5XG4gKiBAcGFyYW0ge0Jvb2x9IGFycmF5VHlwZSAtIHRydWUgaWYgYSBwYXJhbSBzaG91bGQgYmUgZGVjb2RlZCBhcyBhbiBhcnJheVxuICogQHJldHVybiB7T2JqZWN0fSBwbGFpbiBkZWNvZGVkIHBhcmFtXG4gKi9cblNvbGlkaXR5VHlwZS5wcm90b3R5cGUuZm9ybWF0T3V0cHV0ID0gZnVuY3Rpb24gKHBhcmFtLCBhcnJheVR5cGUpIHtcbiAgICBpZiAoYXJyYXlUeXBlKSB7XG4gICAgICAgIC8vIGxldCdzIGFzc3VtZSwgdGhhdCB3ZSBzb2xpZGl0eSB3aWxsIG5ldmVyIHJldHVybiBsb25nIGFycmF5cyA6UCBcbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgICAgICB2YXIgbGVuZ3RoID0gbmV3IEJpZ051bWJlcihwYXJhbS5keW5hbWljUGFydCgpLnNsaWNlKDAsIDY0KSwgMTYpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aCAqIDY0OyBpICs9IDY0KSB7XG4gICAgICAgICAgICByZXN1bHQucHVzaCh0aGlzLl9vdXRwdXRGb3JtYXR0ZXIobmV3IFNvbGlkaXR5UGFyYW0ocGFyYW0uZHluYW1pY1BhcnQoKS5zdWJzdHIoaSArIDY0LCA2NCkpKSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuX291dHB1dEZvcm1hdHRlcihwYXJhbSk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIHNsaWNlIHNpbmdsZSBwYXJhbSBmcm9tIGJ5dGVzXG4gKlxuICogQG1ldGhvZCBzbGljZVBhcmFtXG4gKiBAcGFyYW0ge1N0cmluZ30gYnl0ZXNcbiAqIEBwYXJhbSB7TnVtYmVyfSBpbmRleCBvZiBwYXJhbSB0byBzbGljZVxuICogQHBhcmFtIHtTdHJpbmd9IHR5cGVcbiAqIEByZXR1cm5zIHtTb2xpZGl0eVBhcmFtfSBwYXJhbVxuICovXG5Tb2xpZGl0eVR5cGUucHJvdG90eXBlLnNsaWNlUGFyYW0gPSBmdW5jdGlvbiAoYnl0ZXMsIGluZGV4LCB0eXBlKSB7XG4gICAgaWYgKHRoaXMuX21vZGUgPT09ICdieXRlcycpIHtcbiAgICAgICAgcmV0dXJuIFNvbGlkaXR5UGFyYW0uZGVjb2RlQnl0ZXMoYnl0ZXMsIGluZGV4KTtcbiAgICB9IGVsc2UgaWYgKGlzQXJyYXlUeXBlKHR5cGUpKSB7XG4gICAgICAgIHJldHVybiBTb2xpZGl0eVBhcmFtLmRlY29kZUFycmF5KGJ5dGVzLCBpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBTb2xpZGl0eVBhcmFtLmRlY29kZVBhcmFtKGJ5dGVzLCBpbmRleCk7XG59O1xuXG4vKipcbiAqIFNvbGlkaXR5Q29kZXIgcHJvdG90eXBlIHNob3VsZCBiZSB1c2VkIHRvIGVuY29kZS9kZWNvZGUgc29saWRpdHkgcGFyYW1zIG9mIGFueSB0eXBlXG4gKi9cbnZhciBTb2xpZGl0eUNvZGVyID0gZnVuY3Rpb24gKHR5cGVzKSB7XG4gICAgdGhpcy5fdHlwZXMgPSB0eXBlcztcbn07XG5cbi8qKlxuICogVGhpcyBtZXRob2Qgc2hvdWxkIGJlIHVzZWQgdG8gdHJhbnNmb3JtIHR5cGUgdG8gU29saWRpdHlUeXBlXG4gKlxuICogQG1ldGhvZCBfcmVxdWlyZVR5cGVcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlXG4gKiBAcmV0dXJucyB7U29saWRpdHlUeXBlfSBcbiAqIEB0aHJvd3Mge0Vycm9yfSB0aHJvd3MgaWYgbm8gbWF0Y2hpbmcgdHlwZSBpcyBmb3VuZFxuICovXG5Tb2xpZGl0eUNvZGVyLnByb3RvdHlwZS5fcmVxdWlyZVR5cGUgPSBmdW5jdGlvbiAodHlwZSkge1xuICAgIHZhciBzb2xpZGl0eVR5cGUgPSB0aGlzLl90eXBlcy5maWx0ZXIoZnVuY3Rpb24gKHQpIHtcbiAgICAgICAgcmV0dXJuIHQuaXNUeXBlKHR5cGUpO1xuICAgIH0pWzBdO1xuXG4gICAgaWYgKCFzb2xpZGl0eVR5cGUpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoJ2ludmFsaWQgc29saWRpdHkgdHlwZSE6ICcgKyB0eXBlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gc29saWRpdHlUeXBlO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byB0cmFuc2Zvcm0gcGxhaW4gcGFyYW0gb2YgZ2l2ZW4gdHlwZSB0byBTb2xpZGl0eVBhcmFtXG4gKlxuICogQG1ldGhvZCBfZm9ybWF0SW5wdXRcbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlIG9mIHBhcmFtXG4gKiBAcGFyYW0ge09iamVjdH0gcGxhaW4gcGFyYW1cbiAqIEByZXR1cm4ge1NvbGlkaXR5UGFyYW19XG4gKi9cblNvbGlkaXR5Q29kZXIucHJvdG90eXBlLl9mb3JtYXRJbnB1dCA9IGZ1bmN0aW9uICh0eXBlLCBwYXJhbSkge1xuICAgIHJldHVybiB0aGlzLl9yZXF1aXJlVHlwZSh0eXBlKS5mb3JtYXRJbnB1dChwYXJhbSwgaXNBcnJheVR5cGUodHlwZSkpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBlbmNvZGUgcGxhaW4gcGFyYW1cbiAqXG4gKiBAbWV0aG9kIGVuY29kZVBhcmFtXG4gKiBAcGFyYW0ge1N0cmluZ30gdHlwZVxuICogQHBhcmFtIHtPYmplY3R9IHBsYWluIHBhcmFtXG4gKiBAcmV0dXJuIHtTdHJpbmd9IGVuY29kZWQgcGxhaW4gcGFyYW1cbiAqL1xuU29saWRpdHlDb2Rlci5wcm90b3R5cGUuZW5jb2RlUGFyYW0gPSBmdW5jdGlvbiAodHlwZSwgcGFyYW0pIHtcbiAgICByZXR1cm4gdGhpcy5fZm9ybWF0SW5wdXQodHlwZSwgcGFyYW0pLmVuY29kZSgpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBlbmNvZGUgbGlzdCBvZiBwYXJhbXNcbiAqXG4gKiBAbWV0aG9kIGVuY29kZVBhcmFtc1xuICogQHBhcmFtIHtBcnJheX0gdHlwZXNcbiAqIEBwYXJhbSB7QXJyYXl9IHBhcmFtc1xuICogQHJldHVybiB7U3RyaW5nfSBlbmNvZGVkIGxpc3Qgb2YgcGFyYW1zXG4gKi9cblNvbGlkaXR5Q29kZXIucHJvdG90eXBlLmVuY29kZVBhcmFtcyA9IGZ1bmN0aW9uICh0eXBlcywgcGFyYW1zKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBzb2xpZGl0eVBhcmFtcyA9IHR5cGVzLm1hcChmdW5jdGlvbiAodHlwZSwgaW5kZXgpIHtcbiAgICAgICAgcmV0dXJuIHNlbGYuX2Zvcm1hdElucHV0KHR5cGUsIHBhcmFtc1tpbmRleF0pO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIFNvbGlkaXR5UGFyYW0uZW5jb2RlTGlzdChzb2xpZGl0eVBhcmFtcyk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGRlY29kZSBieXRlcyB0byBwbGFpbiBwYXJhbVxuICpcbiAqIEBtZXRob2QgZGVjb2RlUGFyYW1cbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlXG4gKiBAcGFyYW0ge1N0cmluZ30gYnl0ZXNcbiAqIEByZXR1cm4ge09iamVjdH0gcGxhaW4gcGFyYW1cbiAqL1xuU29saWRpdHlDb2Rlci5wcm90b3R5cGUuZGVjb2RlUGFyYW0gPSBmdW5jdGlvbiAodHlwZSwgYnl0ZXMpIHtcbiAgICByZXR1cm4gdGhpcy5kZWNvZGVQYXJhbXMoW3R5cGVdLCBieXRlcylbMF07XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGRlY29kZSBsaXN0IG9mIHBhcmFtc1xuICpcbiAqIEBtZXRob2QgZGVjb2RlUGFyYW1cbiAqIEBwYXJhbSB7QXJyYXl9IHR5cGVzXG4gKiBAcGFyYW0ge1N0cmluZ30gYnl0ZXNcbiAqIEByZXR1cm4ge0FycmF5fSBhcnJheSBvZiBwbGFpbiBwYXJhbXNcbiAqL1xuU29saWRpdHlDb2Rlci5wcm90b3R5cGUuZGVjb2RlUGFyYW1zID0gZnVuY3Rpb24gKHR5cGVzLCBieXRlcykge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gdHlwZXMubWFwKGZ1bmN0aW9uICh0eXBlLCBpbmRleCkge1xuICAgICAgICB2YXIgc29saWRpdHlUeXBlID0gc2VsZi5fcmVxdWlyZVR5cGUodHlwZSk7XG4gICAgICAgIHZhciBwID0gc29saWRpdHlUeXBlLnNsaWNlUGFyYW0oYnl0ZXMsIGluZGV4LCB0eXBlKTtcbiAgICAgICAgcmV0dXJuIHNvbGlkaXR5VHlwZS5mb3JtYXRPdXRwdXQocCwgaXNBcnJheVR5cGUodHlwZSkpO1xuICAgIH0pO1xufTtcblxudmFyIGNvZGVyID0gbmV3IFNvbGlkaXR5Q29kZXIoW1xuICAgIG5ldyBTb2xpZGl0eVR5cGUoe1xuICAgICAgICBuYW1lOiAnYWRkcmVzcycsXG4gICAgICAgIG1hdGNoOiAnc3RyaWN0JyxcbiAgICAgICAgbW9kZTogJ3ZhbHVlJyxcbiAgICAgICAgaW5wdXRGb3JtYXR0ZXI6IGYuZm9ybWF0SW5wdXRJbnQsXG4gICAgICAgIG91dHB1dEZvcm1hdHRlcjogZi5mb3JtYXRPdXRwdXRBZGRyZXNzXG4gICAgfSksXG4gICAgbmV3IFNvbGlkaXR5VHlwZSh7XG4gICAgICAgIG5hbWU6ICdib29sJyxcbiAgICAgICAgbWF0Y2g6ICdzdHJpY3QnLFxuICAgICAgICBtb2RlOiAndmFsdWUnLFxuICAgICAgICBpbnB1dEZvcm1hdHRlcjogZi5mb3JtYXRJbnB1dEJvb2wsXG4gICAgICAgIG91dHB1dEZvcm1hdHRlcjogZi5mb3JtYXRPdXRwdXRCb29sXG4gICAgfSksXG4gICAgbmV3IFNvbGlkaXR5VHlwZSh7XG4gICAgICAgIG5hbWU6ICdpbnQnLFxuICAgICAgICBtYXRjaDogJ3ByZWZpeCcsXG4gICAgICAgIG1vZGU6ICd2YWx1ZScsXG4gICAgICAgIGlucHV0Rm9ybWF0dGVyOiBmLmZvcm1hdElucHV0SW50LFxuICAgICAgICBvdXRwdXRGb3JtYXR0ZXI6IGYuZm9ybWF0T3V0cHV0SW50LFxuICAgIH0pLFxuICAgIG5ldyBTb2xpZGl0eVR5cGUoe1xuICAgICAgICBuYW1lOiAndWludCcsXG4gICAgICAgIG1hdGNoOiAncHJlZml4JyxcbiAgICAgICAgbW9kZTogJ3ZhbHVlJyxcbiAgICAgICAgaW5wdXRGb3JtYXR0ZXI6IGYuZm9ybWF0SW5wdXRJbnQsXG4gICAgICAgIG91dHB1dEZvcm1hdHRlcjogZi5mb3JtYXRPdXRwdXRVSW50XG4gICAgfSksXG4gICAgbmV3IFNvbGlkaXR5VHlwZSh7XG4gICAgICAgIG5hbWU6ICdieXRlcycsXG4gICAgICAgIG1hdGNoOiAnc3RyaWN0JyxcbiAgICAgICAgbW9kZTogJ2J5dGVzJyxcbiAgICAgICAgaW5wdXRGb3JtYXR0ZXI6IGYuZm9ybWF0SW5wdXREeW5hbWljQnl0ZXMsXG4gICAgICAgIG91dHB1dEZvcm1hdHRlcjogZi5mb3JtYXRPdXRwdXREeW5hbWljQnl0ZXNcbiAgICB9KSxcbiAgICBuZXcgU29saWRpdHlUeXBlKHtcbiAgICAgICAgbmFtZTogJ2J5dGVzJyxcbiAgICAgICAgbWF0Y2g6ICdwcmVmaXgnLFxuICAgICAgICBtb2RlOiAndmFsdWUnLFxuICAgICAgICBpbnB1dEZvcm1hdHRlcjogZi5mb3JtYXRJbnB1dEJ5dGVzLFxuICAgICAgICBvdXRwdXRGb3JtYXR0ZXI6IGYuZm9ybWF0T3V0cHV0Qnl0ZXNcbiAgICB9KSxcbiAgICBuZXcgU29saWRpdHlUeXBlKHtcbiAgICAgICAgbmFtZTogJ3JlYWwnLFxuICAgICAgICBtYXRjaDogJ3ByZWZpeCcsXG4gICAgICAgIG1vZGU6ICd2YWx1ZScsXG4gICAgICAgIGlucHV0Rm9ybWF0dGVyOiBmLmZvcm1hdElucHV0UmVhbCxcbiAgICAgICAgb3V0cHV0Rm9ybWF0dGVyOiBmLmZvcm1hdE91dHB1dFJlYWxcbiAgICB9KSxcbiAgICBuZXcgU29saWRpdHlUeXBlKHtcbiAgICAgICAgbmFtZTogJ3VyZWFsJyxcbiAgICAgICAgbWF0Y2g6ICdwcmVmaXgnLFxuICAgICAgICBtb2RlOiAndmFsdWUnLFxuICAgICAgICBpbnB1dEZvcm1hdHRlcjogZi5mb3JtYXRJbnB1dFJlYWwsXG4gICAgICAgIG91dHB1dEZvcm1hdHRlcjogZi5mb3JtYXRPdXRwdXRVUmVhbFxuICAgIH0pXG5dKTtcblxubW9kdWxlLmV4cG9ydHMgPSBjb2RlcjtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogXG4gKiBAZmlsZSBmb3JtYXR0ZXJzLmpzXG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciBCaWdOdW1iZXIgPSByZXF1aXJlKCdiaWdudW1iZXIuanMnKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG52YXIgYyA9IHJlcXVpcmUoJy4uL3V0aWxzL2NvbmZpZycpO1xudmFyIFNvbGlkaXR5UGFyYW0gPSByZXF1aXJlKCcuL3BhcmFtJyk7XG5cblxuLyoqXG4gKiBGb3JtYXRzIGlucHV0IHZhbHVlIHRvIGJ5dGUgcmVwcmVzZW50YXRpb24gb2YgaW50XG4gKiBJZiB2YWx1ZSBpcyBuZWdhdGl2ZSwgcmV0dXJuIGl0J3MgdHdvJ3MgY29tcGxlbWVudFxuICogSWYgdGhlIHZhbHVlIGlzIGZsb2F0aW5nIHBvaW50LCByb3VuZCBpdCBkb3duXG4gKlxuICogQG1ldGhvZCBmb3JtYXRJbnB1dEludFxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfEJpZ051bWJlcn0gdmFsdWUgdGhhdCBuZWVkcyB0byBiZSBmb3JtYXR0ZWRcbiAqIEByZXR1cm5zIHtTb2xpZGl0eVBhcmFtfVxuICovXG52YXIgZm9ybWF0SW5wdXRJbnQgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgcGFkZGluZyA9IGMuRVRIX1BBRERJTkcgKiAyO1xuICAgIEJpZ051bWJlci5jb25maWcoYy5FVEhfQklHTlVNQkVSX1JPVU5ESU5HX01PREUpO1xuICAgIHZhciByZXN1bHQgPSB1dGlscy5wYWRMZWZ0KHV0aWxzLnRvVHdvc0NvbXBsZW1lbnQodmFsdWUpLnJvdW5kKCkudG9TdHJpbmcoMTYpLCBwYWRkaW5nKTtcbiAgICByZXR1cm4gbmV3IFNvbGlkaXR5UGFyYW0ocmVzdWx0KTtcbn07XG5cbi8qKlxuICogRm9ybWF0cyBpbnB1dCB2YWx1ZSB0byBieXRlIHJlcHJlc2VudGF0aW9uIG9mIHN0cmluZ1xuICpcbiAqIEBtZXRob2QgZm9ybWF0SW5wdXRCeXRlc1xuICogQHBhcmFtIHtTdHJpbmd9XG4gKiBAcmV0dXJucyB7U29saWRpdHlQYXJhbX1cbiAqL1xudmFyIGZvcm1hdElucHV0Qnl0ZXMgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgcmVzdWx0ID0gdXRpbHMuZnJvbUFzY2lpKHZhbHVlLCBjLkVUSF9QQURESU5HKS5zdWJzdHIoMik7XG4gICAgcmV0dXJuIG5ldyBTb2xpZGl0eVBhcmFtKHJlc3VsdCk7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgaW5wdXQgdmFsdWUgdG8gYnl0ZSByZXByZXNlbnRhdGlvbiBvZiBzdHJpbmdcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdElucHV0RHluYW1pY0J5dGVzXG4gKiBAcGFyYW0ge1N0cmluZ31cbiAqIEByZXR1cm5zIHtTb2xpZGl0eVBhcmFtfVxuICovXG52YXIgZm9ybWF0SW5wdXREeW5hbWljQnl0ZXMgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgcmVzdWx0ID0gdXRpbHMuZnJvbUFzY2lpKHZhbHVlLCBjLkVUSF9QQURESU5HKS5zdWJzdHIoMik7XG4gICAgcmV0dXJuIG5ldyBTb2xpZGl0eVBhcmFtKGZvcm1hdElucHV0SW50KHZhbHVlLmxlbmd0aCkudmFsdWUgKyByZXN1bHQsIDMyKTtcbn07XG5cbi8qKlxuICogRm9ybWF0cyBpbnB1dCB2YWx1ZSB0byBieXRlIHJlcHJlc2VudGF0aW9uIG9mIGJvb2xcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdElucHV0Qm9vbFxuICogQHBhcmFtIHtCb29sZWFufVxuICogQHJldHVybnMge1NvbGlkaXR5UGFyYW19XG4gKi9cbnZhciBmb3JtYXRJbnB1dEJvb2wgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgcmVzdWx0ID0gJzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCcgKyAodmFsdWUgPyAgJzEnIDogJzAnKTtcbiAgICByZXR1cm4gbmV3IFNvbGlkaXR5UGFyYW0ocmVzdWx0KTtcbn07XG5cbi8qKlxuICogRm9ybWF0cyBpbnB1dCB2YWx1ZSB0byBieXRlIHJlcHJlc2VudGF0aW9uIG9mIHJlYWxcbiAqIFZhbHVlcyBhcmUgbXVsdGlwbGllZCBieSAyXm0gYW5kIGVuY29kZWQgYXMgaW50ZWdlcnNcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdElucHV0UmVhbFxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfEJpZ051bWJlcn1cbiAqIEByZXR1cm5zIHtTb2xpZGl0eVBhcmFtfVxuICovXG52YXIgZm9ybWF0SW5wdXRSZWFsID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGZvcm1hdElucHV0SW50KG5ldyBCaWdOdW1iZXIodmFsdWUpLnRpbWVzKG5ldyBCaWdOdW1iZXIoMikucG93KDEyOCkpKTtcbn07XG5cbi8qKlxuICogQ2hlY2sgaWYgaW5wdXQgdmFsdWUgaXMgbmVnYXRpdmVcbiAqXG4gKiBAbWV0aG9kIHNpZ25lZElzTmVnYXRpdmVcbiAqIEBwYXJhbSB7U3RyaW5nfSB2YWx1ZSBpcyBoZXggZm9ybWF0XG4gKiBAcmV0dXJucyB7Qm9vbGVhbn0gdHJ1ZSBpZiBpdCBpcyBuZWdhdGl2ZSwgb3RoZXJ3aXNlIGZhbHNlXG4gKi9cbnZhciBzaWduZWRJc05lZ2F0aXZlID0gZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIChuZXcgQmlnTnVtYmVyKHZhbHVlLnN1YnN0cigwLCAxKSwgMTYpLnRvU3RyaW5nKDIpLnN1YnN0cigwLCAxKSkgPT09ICcxJztcbn07XG5cbi8qKlxuICogRm9ybWF0cyByaWdodC1hbGlnbmVkIG91dHB1dCBieXRlcyB0byBpbnRcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdE91dHB1dEludFxuICogQHBhcmFtIHtTb2xpZGl0eVBhcmFtfSBwYXJhbVxuICogQHJldHVybnMge0JpZ051bWJlcn0gcmlnaHQtYWxpZ25lZCBvdXRwdXQgYnl0ZXMgZm9ybWF0dGVkIHRvIGJpZyBudW1iZXJcbiAqL1xudmFyIGZvcm1hdE91dHB1dEludCA9IGZ1bmN0aW9uIChwYXJhbSkge1xuICAgIHZhciB2YWx1ZSA9IHBhcmFtLnN0YXRpY1BhcnQoKSB8fCBcIjBcIjtcblxuICAgIC8vIGNoZWNrIGlmIGl0J3MgbmVnYXRpdmUgbnVtYmVyXG4gICAgLy8gaXQgaXQgaXMsIHJldHVybiB0d28ncyBjb21wbGVtZW50XG4gICAgaWYgKHNpZ25lZElzTmVnYXRpdmUodmFsdWUpKSB7XG4gICAgICAgIHJldHVybiBuZXcgQmlnTnVtYmVyKHZhbHVlLCAxNikubWludXMobmV3IEJpZ051bWJlcignZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZicsIDE2KSkubWludXMoMSk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgQmlnTnVtYmVyKHZhbHVlLCAxNik7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgcmlnaHQtYWxpZ25lZCBvdXRwdXQgYnl0ZXMgdG8gdWludFxuICpcbiAqIEBtZXRob2QgZm9ybWF0T3V0cHV0VUludFxuICogQHBhcmFtIHtTb2xpZGl0eVBhcmFtfVxuICogQHJldHVybnMge0JpZ051bWViZXJ9IHJpZ2h0LWFsaWduZWQgb3V0cHV0IGJ5dGVzIGZvcm1hdHRlZCB0byB1aW50XG4gKi9cbnZhciBmb3JtYXRPdXRwdXRVSW50ID0gZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgdmFyIHZhbHVlID0gcGFyYW0uc3RhdGljUGFydCgpIHx8IFwiMFwiO1xuICAgIHJldHVybiBuZXcgQmlnTnVtYmVyKHZhbHVlLCAxNik7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgcmlnaHQtYWxpZ25lZCBvdXRwdXQgYnl0ZXMgdG8gcmVhbFxuICpcbiAqIEBtZXRob2QgZm9ybWF0T3V0cHV0UmVhbFxuICogQHBhcmFtIHtTb2xpZGl0eVBhcmFtfVxuICogQHJldHVybnMge0JpZ051bWJlcn0gaW5wdXQgYnl0ZXMgZm9ybWF0dGVkIHRvIHJlYWxcbiAqL1xudmFyIGZvcm1hdE91dHB1dFJlYWwgPSBmdW5jdGlvbiAocGFyYW0pIHtcbiAgICByZXR1cm4gZm9ybWF0T3V0cHV0SW50KHBhcmFtKS5kaXZpZGVkQnkobmV3IEJpZ051bWJlcigyKS5wb3coMTI4KSk7IFxufTtcblxuLyoqXG4gKiBGb3JtYXRzIHJpZ2h0LWFsaWduZWQgb3V0cHV0IGJ5dGVzIHRvIHVyZWFsXG4gKlxuICogQG1ldGhvZCBmb3JtYXRPdXRwdXRVUmVhbFxuICogQHBhcmFtIHtTb2xpZGl0eVBhcmFtfVxuICogQHJldHVybnMge0JpZ051bWJlcn0gaW5wdXQgYnl0ZXMgZm9ybWF0dGVkIHRvIHVyZWFsXG4gKi9cbnZhciBmb3JtYXRPdXRwdXRVUmVhbCA9IGZ1bmN0aW9uIChwYXJhbSkge1xuICAgIHJldHVybiBmb3JtYXRPdXRwdXRVSW50KHBhcmFtKS5kaXZpZGVkQnkobmV3IEJpZ051bWJlcigyKS5wb3coMTI4KSk7IFxufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBmb3JtYXQgb3V0cHV0IGJvb2xcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdE91dHB1dEJvb2xcbiAqIEBwYXJhbSB7U29saWRpdHlQYXJhbX1cbiAqIEByZXR1cm5zIHtCb29sZWFufSByaWdodC1hbGlnbmVkIGlucHV0IGJ5dGVzIGZvcm1hdHRlZCB0byBib29sXG4gKi9cbnZhciBmb3JtYXRPdXRwdXRCb29sID0gZnVuY3Rpb24gKHBhcmFtKSB7XG4gICAgcmV0dXJuIHBhcmFtLnN0YXRpY1BhcnQoKSA9PT0gJzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDEnID8gdHJ1ZSA6IGZhbHNlO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBmb3JtYXQgb3V0cHV0IHN0cmluZ1xuICpcbiAqIEBtZXRob2QgZm9ybWF0T3V0cHV0Qnl0ZXNcbiAqIEBwYXJhbSB7U29saWRpdHlQYXJhbX0gbGVmdC1hbGlnbmVkIGhleCByZXByZXNlbnRhdGlvbiBvZiBzdHJpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IGFzY2lpIHN0cmluZ1xuICovXG52YXIgZm9ybWF0T3V0cHV0Qnl0ZXMgPSBmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAvLyBsZW5ndGggbWlnaHQgYWxzbyBiZSBpbXBvcnRhbnQhXG4gICAgcmV0dXJuIHV0aWxzLnRvQXNjaWkocGFyYW0uc3RhdGljUGFydCgpKTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZm9ybWF0IG91dHB1dCBzdHJpbmdcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdE91dHB1dER5bmFtaWNCeXRlc1xuICogQHBhcmFtIHtTb2xpZGl0eVBhcmFtfSBsZWZ0LWFsaWduZWQgaGV4IHJlcHJlc2VudGF0aW9uIG9mIHN0cmluZ1xuICogQHJldHVybnMge1N0cmluZ30gYXNjaWkgc3RyaW5nXG4gKi9cbnZhciBmb3JtYXRPdXRwdXREeW5hbWljQnl0ZXMgPSBmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAvLyBsZW5ndGggbWlnaHQgYWxzbyBiZSBpbXBvcnRhbnQhXG4gICAgcmV0dXJuIHV0aWxzLnRvQXNjaWkocGFyYW0uZHluYW1pY1BhcnQoKS5zbGljZSg2NCkpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBmb3JtYXQgb3V0cHV0IGFkZHJlc3NcbiAqXG4gKiBAbWV0aG9kIGZvcm1hdE91dHB1dEFkZHJlc3NcbiAqIEBwYXJhbSB7U29saWRpdHlQYXJhbX0gcmlnaHQtYWxpZ25lZCBpbnB1dCBieXRlc1xuICogQHJldHVybnMge1N0cmluZ30gYWRkcmVzc1xuICovXG52YXIgZm9ybWF0T3V0cHV0QWRkcmVzcyA9IGZ1bmN0aW9uIChwYXJhbSkge1xuICAgIHZhciB2YWx1ZSA9IHBhcmFtLnN0YXRpY1BhcnQoKTtcbiAgICByZXR1cm4gXCIweFwiICsgdmFsdWUuc2xpY2UodmFsdWUubGVuZ3RoIC0gNDAsIHZhbHVlLmxlbmd0aCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBmb3JtYXRJbnB1dEludDogZm9ybWF0SW5wdXRJbnQsXG4gICAgZm9ybWF0SW5wdXRCeXRlczogZm9ybWF0SW5wdXRCeXRlcyxcbiAgICBmb3JtYXRJbnB1dER5bmFtaWNCeXRlczogZm9ybWF0SW5wdXREeW5hbWljQnl0ZXMsXG4gICAgZm9ybWF0SW5wdXRCb29sOiBmb3JtYXRJbnB1dEJvb2wsXG4gICAgZm9ybWF0SW5wdXRSZWFsOiBmb3JtYXRJbnB1dFJlYWwsXG4gICAgZm9ybWF0T3V0cHV0SW50OiBmb3JtYXRPdXRwdXRJbnQsXG4gICAgZm9ybWF0T3V0cHV0VUludDogZm9ybWF0T3V0cHV0VUludCxcbiAgICBmb3JtYXRPdXRwdXRSZWFsOiBmb3JtYXRPdXRwdXRSZWFsLFxuICAgIGZvcm1hdE91dHB1dFVSZWFsOiBmb3JtYXRPdXRwdXRVUmVhbCxcbiAgICBmb3JtYXRPdXRwdXRCb29sOiBmb3JtYXRPdXRwdXRCb29sLFxuICAgIGZvcm1hdE91dHB1dEJ5dGVzOiBmb3JtYXRPdXRwdXRCeXRlcyxcbiAgICBmb3JtYXRPdXRwdXREeW5hbWljQnl0ZXM6IGZvcm1hdE91dHB1dER5bmFtaWNCeXRlcyxcbiAgICBmb3JtYXRPdXRwdXRBZGRyZXNzOiBmb3JtYXRPdXRwdXRBZGRyZXNzXG59O1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBcbiAqIEBmaWxlIHBhcmFtLmpzXG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG5cbi8qKlxuICogU29saWRpdHlQYXJhbSBvYmplY3QgcHJvdG90eXBlLlxuICogU2hvdWxkIGJlIHVzZWQgd2hlbiBlbmNvZGluZywgZGVjb2Rpbmcgc29saWRpdHkgYnl0ZXNcbiAqL1xudmFyIFNvbGlkaXR5UGFyYW0gPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCkge1xuICAgIHRoaXMudmFsdWUgPSB2YWx1ZSB8fCAnJztcbiAgICB0aGlzLm9mZnNldCA9IG9mZnNldDsgLy8gb2Zmc2V0IGluIGJ5dGVzXG59O1xuXG4vKipcbiAqIFRoaXMgbWV0aG9kIHNob3VsZCBiZSB1c2VkIHRvIGdldCBsZW5ndGggb2YgcGFyYW1zJ3MgZHluYW1pYyBwYXJ0XG4gKiBcbiAqIEBtZXRob2QgZHluYW1pY1BhcnRMZW5ndGhcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGxlbmd0aCBvZiBkeW5hbWljIHBhcnQgKGluIGJ5dGVzKVxuICovXG5Tb2xpZGl0eVBhcmFtLnByb3RvdHlwZS5keW5hbWljUGFydExlbmd0aCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5keW5hbWljUGFydCgpLmxlbmd0aCAvIDI7XG59O1xuXG4vKipcbiAqIFRoaXMgbWV0aG9kIHNob3VsZCBiZSB1c2VkIHRvIGNyZWF0ZSBjb3B5IG9mIHNvbGlkaXR5IHBhcmFtIHdpdGggZGlmZmVyZW50IG9mZnNldFxuICpcbiAqIEBtZXRob2Qgd2l0aE9mZnNldFxuICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBsZW5ndGggaW4gYnl0ZXNcbiAqIEByZXR1cm5zIHtTb2xpZGl0eVBhcmFtfSBuZXcgc29saWRpdHkgcGFyYW0gd2l0aCBhcHBsaWVkIG9mZnNldFxuICovXG5Tb2xpZGl0eVBhcmFtLnByb3RvdHlwZS53aXRoT2Zmc2V0ID0gZnVuY3Rpb24gKG9mZnNldCkge1xuICAgIHJldHVybiBuZXcgU29saWRpdHlQYXJhbSh0aGlzLnZhbHVlLCBvZmZzZXQpO1xufTtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBzaG91bGQgYmUgdXNlZCB0byBjb21iaW5lIHNvbGlkaXR5IHBhcmFtcyB0b2dldGhlclxuICogZWcuIHdoZW4gYXBwZW5kaW5nIGFuIGFycmF5XG4gKlxuICogQG1ldGhvZCBjb21iaW5lXG4gKiBAcGFyYW0ge1NvbGlkaXR5UGFyYW19IHBhcmFtIHdpdGggd2hpY2ggd2Ugc2hvdWxkIGNvbWJpbmVcbiAqIEBwYXJhbSB7U29saWRpdHlQYXJhbX0gcmVzdWx0IG9mIGNvbWJpbmF0aW9uXG4gKi9cblNvbGlkaXR5UGFyYW0ucHJvdG90eXBlLmNvbWJpbmUgPSBmdW5jdGlvbiAocGFyYW0pIHtcbiAgICByZXR1cm4gbmV3IFNvbGlkaXR5UGFyYW0odGhpcy52YWx1ZSArIHBhcmFtLnZhbHVlKTsgXG59O1xuXG4vKipcbiAqIFRoaXMgbWV0aG9kIHNob3VsZCBiZSBjYWxsZWQgdG8gY2hlY2sgaWYgcGFyYW0gaGFzIGR5bmFtaWMgc2l6ZS5cbiAqIElmIGl0IGhhcywgaXQgcmV0dXJucyB0cnVlLCBvdGhlcndpc2UgZmFsc2VcbiAqXG4gKiBAbWV0aG9kIGlzRHluYW1pY1xuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cblNvbGlkaXR5UGFyYW0ucHJvdG90eXBlLmlzRHluYW1pYyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZS5sZW5ndGggPiA2NCB8fCB0aGlzLm9mZnNldCAhPT0gdW5kZWZpbmVkO1xufTtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBzaG91bGQgYmUgY2FsbGVkIHRvIHRyYW5zZm9ybSBvZmZzZXQgdG8gYnl0ZXNcbiAqXG4gKiBAbWV0aG9kIG9mZnNldEFzQnl0ZXNcbiAqIEByZXR1cm5zIHtTdHJpbmd9IGJ5dGVzIHJlcHJlc2VudGF0aW9uIG9mIG9mZnNldFxuICovXG5Tb2xpZGl0eVBhcmFtLnByb3RvdHlwZS5vZmZzZXRBc0J5dGVzID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiAhdGhpcy5pc0R5bmFtaWMoKSA/ICcnIDogdXRpbHMucGFkTGVmdCh1dGlscy50b1R3b3NDb21wbGVtZW50KHRoaXMub2Zmc2V0KS50b1N0cmluZygxNiksIDY0KTtcbn07XG5cbi8qKlxuICogVGhpcyBtZXRob2Qgc2hvdWxkIGJlIGNhbGxlZCB0byBnZXQgc3RhdGljIHBhcnQgb2YgcGFyYW1cbiAqXG4gKiBAbWV0aG9kIHN0YXRpY1BhcnRcbiAqIEByZXR1cm5zIHtTdHJpbmd9IG9mZnNldCBpZiBpdCBpcyBhIGR5bmFtaWMgcGFyYW0sIG90aGVyd2lzZSB2YWx1ZVxuICovXG5Tb2xpZGl0eVBhcmFtLnByb3RvdHlwZS5zdGF0aWNQYXJ0ID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICghdGhpcy5pc0R5bmFtaWMoKSkge1xuICAgICAgICByZXR1cm4gdGhpcy52YWx1ZTsgXG4gICAgfSBcbiAgICByZXR1cm4gdGhpcy5vZmZzZXRBc0J5dGVzKCk7XG59O1xuXG4vKipcbiAqIFRoaXMgbWV0aG9kIHNob3VsZCBiZSBjYWxsZWQgdG8gZ2V0IGR5bmFtaWMgcGFydCBvZiBwYXJhbVxuICpcbiAqIEBtZXRob2QgZHluYW1pY1BhcnRcbiAqIEByZXR1cm5zIHtTdHJpbmd9IHJldHVybnMgYSB2YWx1ZSBpZiBpdCBpcyBhIGR5bmFtaWMgcGFyYW0sIG90aGVyd2lzZSBlbXB0eSBzdHJpbmdcbiAqL1xuU29saWRpdHlQYXJhbS5wcm90b3R5cGUuZHluYW1pY1BhcnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuaXNEeW5hbWljKCkgPyB0aGlzLnZhbHVlIDogJyc7XG59O1xuXG4vKipcbiAqIFRoaXMgbWV0aG9kIHNob3VsZCBiZSBjYWxsZWQgdG8gZW5jb2RlIHBhcmFtXG4gKlxuICogQG1ldGhvZCBlbmNvZGVcbiAqIEByZXR1cm5zIHtTdHJpbmd9XG4gKi9cblNvbGlkaXR5UGFyYW0ucHJvdG90eXBlLmVuY29kZSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5zdGF0aWNQYXJ0KCkgKyB0aGlzLmR5bmFtaWNQYXJ0KCk7XG59O1xuXG4vKipcbiAqIFRoaXMgbWV0aG9kIHNob3VsZCBiZSBjYWxsZWQgdG8gZW5jb2RlIGFycmF5IG9mIHBhcmFtc1xuICpcbiAqIEBtZXRob2QgZW5jb2RlTGlzdFxuICogQHBhcmFtIHtBcnJheVtTb2xpZGl0eVBhcmFtXX0gcGFyYW1zXG4gKiBAcmV0dXJucyB7U3RyaW5nfVxuICovXG5Tb2xpZGl0eVBhcmFtLmVuY29kZUxpc3QgPSBmdW5jdGlvbiAocGFyYW1zKSB7XG4gICAgXG4gICAgLy8gdXBkYXRpbmcgb2Zmc2V0c1xuICAgIHZhciB0b3RhbE9mZnNldCA9IHBhcmFtcy5sZW5ndGggKiAzMjtcbiAgICB2YXIgb2Zmc2V0UGFyYW1zID0gcGFyYW1zLm1hcChmdW5jdGlvbiAocGFyYW0pIHtcbiAgICAgICAgaWYgKCFwYXJhbS5pc0R5bmFtaWMoKSkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcmFtO1xuICAgICAgICB9XG4gICAgICAgIHZhciBvZmZzZXQgPSB0b3RhbE9mZnNldDtcbiAgICAgICAgdG90YWxPZmZzZXQgKz0gcGFyYW0uZHluYW1pY1BhcnRMZW5ndGgoKTtcbiAgICAgICAgcmV0dXJuIHBhcmFtLndpdGhPZmZzZXQob2Zmc2V0KTtcbiAgICB9KTtcblxuICAgIC8vIGVuY29kZSBldmVyeXRoaW5nIVxuICAgIHJldHVybiBvZmZzZXRQYXJhbXMucmVkdWNlKGZ1bmN0aW9uIChyZXN1bHQsIHBhcmFtKSB7XG4gICAgICAgIHJldHVybiByZXN1bHQgKyBwYXJhbS5keW5hbWljUGFydCgpO1xuICAgIH0sIG9mZnNldFBhcmFtcy5yZWR1Y2UoZnVuY3Rpb24gKHJlc3VsdCwgcGFyYW0pIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdCArIHBhcmFtLnN0YXRpY1BhcnQoKTtcbiAgICB9LCAnJykpO1xufTtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBzaG91bGQgYmUgdXNlZCB0byBkZWNvZGUgcGxhaW4gKHN0YXRpYykgc29saWRpdHkgcGFyYW0gYXQgZ2l2ZW4gaW5kZXhcbiAqXG4gKiBAbWV0aG9kIGRlY29kZVBhcmFtXG4gKiBAcGFyYW0ge1N0cmluZ30gYnl0ZXNcbiAqIEBwYXJhbSB7TnVtYmVyfSBpbmRleFxuICogQHJldHVybnMge1NvbGlkaXR5UGFyYW19XG4gKi9cblNvbGlkaXR5UGFyYW0uZGVjb2RlUGFyYW0gPSBmdW5jdGlvbiAoYnl0ZXMsIGluZGV4KSB7XG4gICAgaW5kZXggPSBpbmRleCB8fCAwO1xuICAgIHJldHVybiBuZXcgU29saWRpdHlQYXJhbShieXRlcy5zdWJzdHIoaW5kZXggKiA2NCwgNjQpKTsgXG59O1xuXG4vKipcbiAqIFRoaXMgbWV0aG9kIHNob3VsZCBiZSBjYWxsZWQgdG8gZ2V0IG9mZnNldCB2YWx1ZSBmcm9tIGJ5dGVzIGF0IGdpdmVuIGluZGV4XG4gKlxuICogQG1ldGhvZCBnZXRPZmZzZXRcbiAqIEBwYXJhbSB7U3RyaW5nfSBieXRlc1xuICogQHBhcmFtIHtOdW1iZXJ9IGluZGV4XG4gKiBAcmV0dXJucyB7TnVtYmVyfSBvZmZzZXQgYXMgbnVtYmVyXG4gKi9cbnZhciBnZXRPZmZzZXQgPSBmdW5jdGlvbiAoYnl0ZXMsIGluZGV4KSB7XG4gICAgLy8gd2UgY2FuIGRvIHRoaXMgY2F1c2Ugb2Zmc2V0IGlzIHJhdGhlciBzbWFsbFxuICAgIHJldHVybiBwYXJzZUludCgnMHgnICsgYnl0ZXMuc3Vic3RyKGluZGV4ICogNjQsIDY0KSk7XG59O1xuXG4vKipcbiAqIFRoaXMgbWV0aG9kIHNob3VsZCBiZSBjYWxsZWQgdG8gZGVjb2RlIHNvbGlkaXR5IGJ5dGVzIHBhcmFtIGF0IGdpdmVuIGluZGV4XG4gKlxuICogQG1ldGhvZCBkZWNvZGVCeXRlc1xuICogQHBhcmFtIHtTdHJpbmd9IGJ5dGVzXG4gKiBAcGFyYW0ge051bWJlcn0gaW5kZXhcbiAqIEByZXR1cm5zIHtTb2xpZGl0eVBhcmFtfVxuICovXG5Tb2xpZGl0eVBhcmFtLmRlY29kZUJ5dGVzID0gZnVuY3Rpb24gKGJ5dGVzLCBpbmRleCkge1xuICAgIGluZGV4ID0gaW5kZXggfHwgMDtcbiAgICAvL1RPRE8gYWRkIHN1cHBvcnQgZm9yIHN0cmluZ3MgbG9uZ2VyIHRoYW4gMzIgYnl0ZXNcbiAgICAvL3ZhciBsZW5ndGggPSBwYXJzZUludCgnMHgnICsgYnl0ZXMuc3Vic3RyKG9mZnNldCAqIDY0LCA2NCkpO1xuXG4gICAgdmFyIG9mZnNldCA9IGdldE9mZnNldChieXRlcywgaW5kZXgpO1xuXG4gICAgLy8gMiAqICwgY2F1c2Ugd2UgYWxzbyBwYXJzZSBsZW5ndGhcbiAgICByZXR1cm4gbmV3IFNvbGlkaXR5UGFyYW0oYnl0ZXMuc3Vic3RyKG9mZnNldCAqIDIsIDIgKiA2NCksIDApO1xufTtcblxuLyoqXG4gKiBUaGlzIG1ldGhvZCBzaG91bGQgYmUgdXNlZCB0byBkZWNvZGUgc29saWRpdHkgYXJyYXkgYXQgZ2l2ZW4gaW5kZXhcbiAqXG4gKiBAbWV0aG9kIGRlY29kZUFycmF5XG4gKiBAcGFyYW0ge1N0cmluZ30gYnl0ZXNcbiAqIEBwYXJhbSB7TnVtYmVyfSBpbmRleFxuICogQHJldHVybnMge1NvbGlkaXR5UGFyYW19XG4gKi9cblNvbGlkaXR5UGFyYW0uZGVjb2RlQXJyYXkgPSBmdW5jdGlvbiAoYnl0ZXMsIGluZGV4KSB7XG4gICAgaW5kZXggPSBpbmRleCB8fCAwO1xuICAgIHZhciBvZmZzZXQgPSBnZXRPZmZzZXQoYnl0ZXMsIGluZGV4KTtcbiAgICB2YXIgbGVuZ3RoID0gcGFyc2VJbnQoJzB4JyArIGJ5dGVzLnN1YnN0cihvZmZzZXQgKiAyLCA2NCkpO1xuICAgIHJldHVybiBuZXcgU29saWRpdHlQYXJhbShieXRlcy5zdWJzdHIob2Zmc2V0ICogMiwgKGxlbmd0aCArIDEpICogNjQpLCAwKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU29saWRpdHlQYXJhbTtcblxuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyBnbyBlbnYgZG9lc24ndCBoYXZlIGFuZCBuZWVkIFhNTEh0dHBSZXF1ZXN0XG5pZiAodHlwZW9mIFhNTEh0dHBSZXF1ZXN0ID09PSAndW5kZWZpbmVkJykge1xuICAgIGV4cG9ydHMuWE1MSHR0cFJlcXVlc3QgPSB7fTtcbn0gZWxzZSB7XG4gICAgZXhwb3J0cy5YTUxIdHRwUmVxdWVzdCA9IFhNTEh0dHBSZXF1ZXN0OyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbn1cblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogQGZpbGUgY29uZmlnLmpzXG4gKiBAYXV0aG9yczpcbiAqICAgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiBAZGF0ZSAyMDE1XG4gKi9cblxuLyoqXG4gKiBVdGlsc1xuICogXG4gKiBAbW9kdWxlIHV0aWxzXG4gKi9cblxuLyoqXG4gKiBVdGlsaXR5IGZ1bmN0aW9uc1xuICogXG4gKiBAY2xhc3MgW3V0aWxzXSBjb25maWdcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5cbi8vLyByZXF1aXJlZCB0byBkZWZpbmUgRVRIX0JJR05VTUJFUl9ST1VORElOR19NT0RFXG52YXIgQmlnTnVtYmVyID0gcmVxdWlyZSgnYmlnbnVtYmVyLmpzJyk7XG5cbnZhciBFVEhfVU5JVFMgPSBbXG4gICAgJ3dlaScsXG4gICAgJ2t3ZWknLFxuICAgICdNd2VpJyxcbiAgICAnR3dlaScsXG4gICAgJ3N6YWJvJyxcbiAgICAnZmlubmV5JyxcbiAgICAnZmVtdG9ldGhlcicsXG4gICAgJ3BpY29ldGhlcicsXG4gICAgJ25hbm9ldGhlcicsXG4gICAgJ21pY3JvZXRoZXInLFxuICAgICdtaWxsaWV0aGVyJyxcbiAgICAnbmFubycsXG4gICAgJ21pY3JvJyxcbiAgICAnbWlsbGknLFxuICAgICdldGhlcicsXG4gICAgJ2dyYW5kJyxcbiAgICAnTWV0aGVyJyxcbiAgICAnR2V0aGVyJyxcbiAgICAnVGV0aGVyJyxcbiAgICAnUGV0aGVyJyxcbiAgICAnRWV0aGVyJyxcbiAgICAnWmV0aGVyJyxcbiAgICAnWWV0aGVyJyxcbiAgICAnTmV0aGVyJyxcbiAgICAnRGV0aGVyJyxcbiAgICAnVmV0aGVyJyxcbiAgICAnVWV0aGVyJ1xuXTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgRVRIX1BBRERJTkc6IDMyLFxuICAgIEVUSF9TSUdOQVRVUkVfTEVOR1RIOiA0LFxuICAgIEVUSF9VTklUUzogRVRIX1VOSVRTLFxuICAgIEVUSF9CSUdOVU1CRVJfUk9VTkRJTkdfTU9ERTogeyBST1VORElOR19NT0RFOiBCaWdOdW1iZXIuUk9VTkRfRE9XTiB9LFxuICAgIEVUSF9QT0xMSU5HX1RJTUVPVVQ6IDEwMDAsXG4gICAgZGVmYXVsdEJsb2NrOiAnbGF0ZXN0JyxcbiAgICBkZWZhdWx0QWNjb3VudDogdW5kZWZpbmVkXG59O1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBcbiAqIEBmaWxlIHNoYTMuanNcbiAqIEBhdXRob3IgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiBAZGF0ZSAyMDE1XG4gKi9cblxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi91dGlscycpO1xudmFyIHNoYTMgPSByZXF1aXJlKCdjcnlwdG8tanMvc2hhMycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChzdHIsIGlzTmV3KSB7XG4gICAgaWYgKHN0ci5zdWJzdHIoMCwgMikgPT09ICcweCcgJiYgIWlzTmV3KSB7XG4gICAgICAgIGNvbnNvbGUud2FybigncmVxdWlyZW1lbnQgb2YgdXNpbmcgd2ViMy5mcm9tQXNjaWkgYmVmb3JlIHNoYTMgaXMgZGVwcmVjYXRlZCcpO1xuICAgICAgICBjb25zb2xlLndhcm4oJ25ldyB1c2FnZTogXFwnd2ViMy5zaGEzKFwiaGVsbG9cIilcXCcnKTtcbiAgICAgICAgY29uc29sZS53YXJuKCdzZWUgaHR0cHM6Ly9naXRodWIuY29tL2V0aGVyZXVtL3dlYjMuanMvcHVsbC8yMDUnKTtcbiAgICAgICAgY29uc29sZS53YXJuKCdpZiB5b3UgbmVlZCB0byBoYXNoIGhleCB2YWx1ZSwgeW91IGNhbiBkbyBcXCdzaGEzKFwiMHhmZmZcIiwgdHJ1ZSlcXCcnKTtcbiAgICAgICAgc3RyID0gdXRpbHMudG9Bc2NpaShzdHIpO1xuICAgIH1cblxuICAgIHJldHVybiBzaGEzKHN0ciwge1xuICAgICAgICBvdXRwdXRMZW5ndGg6IDI1NlxuICAgIH0pLnRvU3RyaW5nKCk7XG59O1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBcbiAqIEBmaWxlIHV0aWxzLmpzXG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbi8qKlxuICogVXRpbHNcbiAqIFxuICogQG1vZHVsZSB1dGlsc1xuICovXG5cbi8qKlxuICogVXRpbGl0eSBmdW5jdGlvbnNcbiAqIFxuICogQGNsYXNzIFt1dGlsc10gdXRpbHNcbiAqIEBjb25zdHJ1Y3RvclxuICovXG5cbnZhciBCaWdOdW1iZXIgPSByZXF1aXJlKCdiaWdudW1iZXIuanMnKTtcblxudmFyIHVuaXRNYXAgPSB7XG4gICAgJ3dlaSc6ICAgICAgICAgICcxJyxcbiAgICAna3dlaSc6ICAgICAgICAgJzEwMDAnLFxuICAgICdhZGEnOiAgICAgICAgICAnMTAwMCcsXG4gICAgJ2ZlbXRvZXRoZXInOiAgICcxMDAwJyxcbiAgICAnbXdlaSc6ICAgICAgICAgJzEwMDAwMDAnLFxuICAgICdiYWJiYWdlJzogICAgICAnMTAwMDAwMCcsXG4gICAgJ3BpY29ldGhlcic6ICAgICcxMDAwMDAwJyxcbiAgICAnZ3dlaSc6ICAgICAgICAgJzEwMDAwMDAwMDAnLFxuICAgICdzaGFubm9uJzogICAgICAnMTAwMDAwMDAwMCcsXG4gICAgJ25hbm9ldGhlcic6ICAgICcxMDAwMDAwMDAwJyxcbiAgICAnbmFubyc6ICAgICAgICAgJzEwMDAwMDAwMDAnLFxuICAgICdzemFibyc6ICAgICAgICAnMTAwMDAwMDAwMDAwMCcsXG4gICAgJ21pY3JvZXRoZXInOiAgICcxMDAwMDAwMDAwMDAwJyxcbiAgICAnbWljcm8nOiAgICAgICAgJzEwMDAwMDAwMDAwMDAnLFxuICAgICdmaW5uZXknOiAgICAgICAnMTAwMDAwMDAwMDAwMDAwMCcsXG4gICAgJ21pbGxpZXRoZXInOiAgICAnMTAwMDAwMDAwMDAwMDAwMCcsXG4gICAgJ21pbGxpJzogICAgICAgICAnMTAwMDAwMDAwMDAwMDAwMCcsXG4gICAgJ2V0aGVyJzogICAgICAgICcxMDAwMDAwMDAwMDAwMDAwMDAwJyxcbiAgICAna2V0aGVyJzogICAgICAgJzEwMDAwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICdncmFuZCc6ICAgICAgICAnMTAwMDAwMDAwMDAwMDAwMDAwMDAwMCcsXG4gICAgJ2VpbnN0ZWluJzogICAgICcxMDAwMDAwMDAwMDAwMDAwMDAwMDAwJyxcbiAgICAnbWV0aGVyJzogICAgICAgJzEwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAnLFxuICAgICdnZXRoZXInOiAgICAgICAnMTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCcsXG4gICAgJ3RldGhlcic6ICAgICAgICcxMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwJ1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIHBhZCBzdHJpbmcgdG8gZXhwZWN0ZWQgbGVuZ3RoXG4gKlxuICogQG1ldGhvZCBwYWRMZWZ0XG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nIHRvIGJlIHBhZGRlZFxuICogQHBhcmFtIHtOdW1iZXJ9IGNoYXJhY3RlcnMgdGhhdCByZXN1bHQgc3RyaW5nIHNob3VsZCBoYXZlXG4gKiBAcGFyYW0ge1N0cmluZ30gc2lnbiwgYnkgZGVmYXVsdCAwXG4gKiBAcmV0dXJucyB7U3RyaW5nfSByaWdodCBhbGlnbmVkIHN0cmluZ1xuICovXG52YXIgcGFkTGVmdCA9IGZ1bmN0aW9uIChzdHJpbmcsIGNoYXJzLCBzaWduKSB7XG4gICAgcmV0dXJuIG5ldyBBcnJheShjaGFycyAtIHN0cmluZy5sZW5ndGggKyAxKS5qb2luKHNpZ24gPyBzaWduIDogXCIwXCIpICsgc3RyaW5nO1xufTtcblxuLyoqIFxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBnZXQgc3RpbmcgZnJvbSBpdCdzIGhleCByZXByZXNlbnRhdGlvblxuICpcbiAqIEBtZXRob2QgdG9Bc2NpaVxuICogQHBhcmFtIHtTdHJpbmd9IHN0cmluZyBpbiBoZXhcbiAqIEByZXR1cm5zIHtTdHJpbmd9IGFzY2lpIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBoZXggdmFsdWVcbiAqL1xudmFyIHRvQXNjaWkgPSBmdW5jdGlvbihoZXgpIHtcbi8vIEZpbmQgdGVybWluYXRpb25cbiAgICB2YXIgc3RyID0gXCJcIjtcbiAgICB2YXIgaSA9IDAsIGwgPSBoZXgubGVuZ3RoO1xuICAgIGlmIChoZXguc3Vic3RyaW5nKDAsIDIpID09PSAnMHgnKSB7XG4gICAgICAgIGkgPSAyO1xuICAgIH1cbiAgICBmb3IgKDsgaSA8IGw7IGkrPTIpIHtcbiAgICAgICAgdmFyIGNvZGUgPSBwYXJzZUludChoZXguc3Vic3RyKGksIDIpLCAxNik7XG4gICAgICAgIGlmIChjb2RlID09PSAwKSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuXG4gICAgICAgIHN0ciArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNvZGUpO1xuICAgIH1cblxuICAgIHJldHVybiBzdHI7XG59O1xuICAgIFxuLyoqXG4gKiBTaG9sZCBiZSBjYWxsZWQgdG8gZ2V0IGhleCByZXByZXNlbnRhdGlvbiAocHJlZml4ZWQgYnkgMHgpIG9mIGFzY2lpIHN0cmluZyBcbiAqXG4gKiBAbWV0aG9kIHRvSGV4TmF0aXZlXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyaW5nXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBoZXggcmVwcmVzZW50YXRpb24gb2YgaW5wdXQgc3RyaW5nXG4gKi9cbnZhciB0b0hleE5hdGl2ZSA9IGZ1bmN0aW9uKHN0cikge1xuICAgIHZhciBoZXggPSBcIlwiO1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIG4gPSBzdHIuY2hhckNvZGVBdChpKS50b1N0cmluZygxNik7XG4gICAgICAgIGhleCArPSBuLmxlbmd0aCA8IDIgPyAnMCcgKyBuIDogbjtcbiAgICB9XG5cbiAgICByZXR1cm4gaGV4O1xufTtcblxuLyoqXG4gKiBTaG9sZCBiZSBjYWxsZWQgdG8gZ2V0IGhleCByZXByZXNlbnRhdGlvbiAocHJlZml4ZWQgYnkgMHgpIG9mIGFzY2lpIHN0cmluZyBcbiAqXG4gKiBAbWV0aG9kIGZyb21Bc2NpaVxuICogQHBhcmFtIHtTdHJpbmd9IHN0cmluZ1xuICogQHBhcmFtIHtOdW1iZXJ9IG9wdGlvbmFsIHBhZGRpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IGhleCByZXByZXNlbnRhdGlvbiBvZiBpbnB1dCBzdHJpbmdcbiAqL1xudmFyIGZyb21Bc2NpaSA9IGZ1bmN0aW9uKHN0ciwgcGFkKSB7XG4gICAgcGFkID0gcGFkID09PSB1bmRlZmluZWQgPyAwIDogcGFkO1xuICAgIHZhciBoZXggPSB0b0hleE5hdGl2ZShzdHIpO1xuICAgIHdoaWxlIChoZXgubGVuZ3RoIDwgcGFkKjIpXG4gICAgICAgIGhleCArPSBcIjAwXCI7XG4gICAgcmV0dXJuIFwiMHhcIiArIGhleDtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gY3JlYXRlIGZ1bGwgZnVuY3Rpb24vZXZlbnQgbmFtZSBmcm9tIGpzb24gYWJpXG4gKlxuICogQG1ldGhvZCB0cmFuc2Zvcm1Ub0Z1bGxOYW1lXG4gKiBAcGFyYW0ge09iamVjdH0ganNvbi1hYmlcbiAqIEByZXR1cm4ge1N0cmluZ30gZnVsbCBmbmN0aW9uL2V2ZW50IG5hbWVcbiAqL1xudmFyIHRyYW5zZm9ybVRvRnVsbE5hbWUgPSBmdW5jdGlvbiAoanNvbikge1xuICAgIGlmIChqc29uLm5hbWUuaW5kZXhPZignKCcpICE9PSAtMSkge1xuICAgICAgICByZXR1cm4ganNvbi5uYW1lO1xuICAgIH1cblxuICAgIHZhciB0eXBlTmFtZSA9IGpzb24uaW5wdXRzLm1hcChmdW5jdGlvbihpKXtyZXR1cm4gaS50eXBlOyB9KS5qb2luKCk7XG4gICAgcmV0dXJuIGpzb24ubmFtZSArICcoJyArIHR5cGVOYW1lICsgJyknO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGdldCBkaXNwbGF5IG5hbWUgb2YgY29udHJhY3QgZnVuY3Rpb25cbiAqIFxuICogQG1ldGhvZCBleHRyYWN0RGlzcGxheU5hbWVcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIG9mIGZ1bmN0aW9uL2V2ZW50XG4gKiBAcmV0dXJucyB7U3RyaW5nfSBkaXNwbGF5IG5hbWUgZm9yIGZ1bmN0aW9uL2V2ZW50IGVnLiBtdWx0aXBseSh1aW50MjU2KSAtPiBtdWx0aXBseVxuICovXG52YXIgZXh0cmFjdERpc3BsYXlOYW1lID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB2YXIgbGVuZ3RoID0gbmFtZS5pbmRleE9mKCcoJyk7IFxuICAgIHJldHVybiBsZW5ndGggIT09IC0xID8gbmFtZS5zdWJzdHIoMCwgbGVuZ3RoKSA6IG5hbWU7XG59O1xuXG4vLy8gQHJldHVybnMgb3ZlcmxvYWRlZCBwYXJ0IG9mIGZ1bmN0aW9uL2V2ZW50IG5hbWVcbnZhciBleHRyYWN0VHlwZU5hbWUgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIC8vLyBUT0RPOiBtYWtlIGl0IGludnVsbmVyYWJsZVxuICAgIHZhciBsZW5ndGggPSBuYW1lLmluZGV4T2YoJygnKTtcbiAgICByZXR1cm4gbGVuZ3RoICE9PSAtMSA/IG5hbWUuc3Vic3RyKGxlbmd0aCArIDEsIG5hbWUubGVuZ3RoIC0gMSAtIChsZW5ndGggKyAxKSkucmVwbGFjZSgnICcsICcnKSA6IFwiXCI7XG59O1xuXG4vKipcbiAqIENvbnZlcnRzIHZhbHVlIHRvIGl0J3MgZGVjaW1hbCByZXByZXNlbnRhdGlvbiBpbiBzdHJpbmdcbiAqXG4gKiBAbWV0aG9kIHRvRGVjaW1hbFxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfEJpZ051bWJlcn1cbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xudmFyIHRvRGVjaW1hbCA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHJldHVybiB0b0JpZ051bWJlcih2YWx1ZSkudG9OdW1iZXIoKTtcbn07XG5cbi8qKlxuICogQ29udmVydHMgdmFsdWUgdG8gaXQncyBoZXggcmVwcmVzZW50YXRpb25cbiAqXG4gKiBAbWV0aG9kIGZyb21EZWNpbWFsXG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ8QmlnTnVtYmVyfVxuICogQHJldHVybiB7U3RyaW5nfVxuICovXG52YXIgZnJvbURlY2ltYWwgPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB2YXIgbnVtYmVyID0gdG9CaWdOdW1iZXIodmFsdWUpO1xuICAgIHZhciByZXN1bHQgPSBudW1iZXIudG9TdHJpbmcoMTYpO1xuXG4gICAgcmV0dXJuIG51bWJlci5sZXNzVGhhbigwKSA/ICctMHgnICsgcmVzdWx0LnN1YnN0cigxKSA6ICcweCcgKyByZXN1bHQ7XG59O1xuXG4vKipcbiAqIEF1dG8gY29udmVydHMgYW55IGdpdmVuIHZhbHVlIGludG8gaXQncyBoZXggcmVwcmVzZW50YXRpb24uXG4gKlxuICogQW5kIGV2ZW4gc3RyaW5naWZ5cyBvYmplY3RzIGJlZm9yZS5cbiAqXG4gKiBAbWV0aG9kIHRvSGV4XG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ8QmlnTnVtYmVyfE9iamVjdH1cbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqL1xudmFyIHRvSGV4ID0gZnVuY3Rpb24gKHZhbCkge1xuICAgIC8qanNoaW50IG1heGNvbXBsZXhpdHk6NyAqL1xuXG4gICAgaWYgKGlzQm9vbGVhbih2YWwpKVxuICAgICAgICByZXR1cm4gZnJvbURlY2ltYWwoK3ZhbCk7XG5cbiAgICBpZiAoaXNCaWdOdW1iZXIodmFsKSlcbiAgICAgICAgcmV0dXJuIGZyb21EZWNpbWFsKHZhbCk7XG5cbiAgICBpZiAoaXNPYmplY3QodmFsKSlcbiAgICAgICAgcmV0dXJuIGZyb21Bc2NpaShKU09OLnN0cmluZ2lmeSh2YWwpKTtcblxuICAgIC8vIGlmIGl0cyBhIG5lZ2F0aXZlIG51bWJlciwgcGFzcyBpdCB0aHJvdWdoIGZyb21EZWNpbWFsXG4gICAgaWYgKGlzU3RyaW5nKHZhbCkpIHtcbiAgICAgICAgaWYgKHZhbC5pbmRleE9mKCctMHgnKSA9PT0gMClcbiAgICAgICAgICAgcmV0dXJuIGZyb21EZWNpbWFsKHZhbCk7XG4gICAgICAgIGVsc2UgaWYgKCFpc0Zpbml0ZSh2YWwpKVxuICAgICAgICAgICAgcmV0dXJuIGZyb21Bc2NpaSh2YWwpO1xuICAgIH1cblxuICAgIHJldHVybiBmcm9tRGVjaW1hbCh2YWwpO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHZhbHVlIG9mIHVuaXQgaW4gV2VpXG4gKlxuICogQG1ldGhvZCBnZXRWYWx1ZU9mVW5pdFxuICogQHBhcmFtIHtTdHJpbmd9IHVuaXQgdGhlIHVuaXQgdG8gY29udmVydCB0bywgZGVmYXVsdCBldGhlclxuICogQHJldHVybnMge0JpZ051bWJlcn0gdmFsdWUgb2YgdGhlIHVuaXQgKGluIFdlaSlcbiAqIEB0aHJvd3MgZXJyb3IgaWYgdGhlIHVuaXQgaXMgbm90IGNvcnJlY3Q6d1xuICovXG52YXIgZ2V0VmFsdWVPZlVuaXQgPSBmdW5jdGlvbiAodW5pdCkge1xuICAgIHVuaXQgPSB1bml0ID8gdW5pdC50b0xvd2VyQ2FzZSgpIDogJ2V0aGVyJztcbiAgICB2YXIgdW5pdFZhbHVlID0gdW5pdE1hcFt1bml0XTtcbiAgICBpZiAodW5pdFZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGlzIHVuaXQgZG9lc25cXCd0IGV4aXN0cywgcGxlYXNlIHVzZSB0aGUgb25lIG9mIHRoZSBmb2xsb3dpbmcgdW5pdHMnICsgSlNPTi5zdHJpbmdpZnkodW5pdE1hcCwgbnVsbCwgMikpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IEJpZ051bWJlcih1bml0VmFsdWUsIDEwKTtcbn07XG5cbi8qKlxuICogVGFrZXMgYSBudW1iZXIgb2Ygd2VpIGFuZCBjb252ZXJ0cyBpdCB0byBhbnkgb3RoZXIgZXRoZXIgdW5pdC5cbiAqXG4gKiBQb3NzaWJsZSB1bml0cyBhcmU6XG4gKiAgIFNJIFNob3J0ICAgU0kgRnVsbCAgICAgICAgRWZmaWd5ICAgICAgIE90aGVyXG4gKiAtIGt3ZWkgICAgICAgZmVtdG9ldGhlciAgICAgYWRhXG4gKiAtIG13ZWkgICAgICAgcGljb2V0aGVyICAgICAgYmFiYmFnZVxuICogLSBnd2VpICAgICAgIG5hbm9ldGhlciAgICAgIHNoYW5ub24gICAgICBuYW5vXG4gKiAtIC0tICAgICAgICAgbWljcm9ldGhlciAgICAgc3phYm8gICAgICAgIG1pY3JvXG4gKiAtIC0tICAgICAgICAgbWlsbGlldGhlciAgICAgZmlubmV5ICAgICAgIG1pbGxpXG4gKiAtIGV0aGVyICAgICAgLS0gICAgICAgICAgICAgLS1cbiAqIC0ga2V0aGVyICAgICAgICAgICAgICAgICAgICBlaW5zdGVpbiAgICAgZ3JhbmQgXG4gKiAtIG1ldGhlclxuICogLSBnZXRoZXJcbiAqIC0gdGV0aGVyXG4gKlxuICogQG1ldGhvZCBmcm9tV2VpXG4gKiBAcGFyYW0ge051bWJlcnxTdHJpbmd9IG51bWJlciBjYW4gYmUgYSBudW1iZXIsIG51bWJlciBzdHJpbmcgb3IgYSBIRVggb2YgYSBkZWNpbWFsXG4gKiBAcGFyYW0ge1N0cmluZ30gdW5pdCB0aGUgdW5pdCB0byBjb252ZXJ0IHRvLCBkZWZhdWx0IGV0aGVyXG4gKiBAcmV0dXJuIHtTdHJpbmd8T2JqZWN0fSBXaGVuIGdpdmVuIGEgQmlnTnVtYmVyIG9iamVjdCBpdCByZXR1cm5zIG9uZSBhcyB3ZWxsLCBvdGhlcndpc2UgYSBudW1iZXJcbiovXG52YXIgZnJvbVdlaSA9IGZ1bmN0aW9uKG51bWJlciwgdW5pdCkge1xuICAgIHZhciByZXR1cm5WYWx1ZSA9IHRvQmlnTnVtYmVyKG51bWJlcikuZGl2aWRlZEJ5KGdldFZhbHVlT2ZVbml0KHVuaXQpKTtcblxuICAgIHJldHVybiBpc0JpZ051bWJlcihudW1iZXIpID8gcmV0dXJuVmFsdWUgOiByZXR1cm5WYWx1ZS50b1N0cmluZygxMCk7IFxufTtcblxuLyoqXG4gKiBUYWtlcyBhIG51bWJlciBvZiBhIHVuaXQgYW5kIGNvbnZlcnRzIGl0IHRvIHdlaS5cbiAqXG4gKiBQb3NzaWJsZSB1bml0cyBhcmU6XG4gKiAgIFNJIFNob3J0ICAgU0kgRnVsbCAgICAgICAgRWZmaWd5ICAgICAgIE90aGVyXG4gKiAtIGt3ZWkgICAgICAgZmVtdG9ldGhlciAgICAgYWRhXG4gKiAtIG13ZWkgICAgICAgcGljb2V0aGVyICAgICAgYmFiYmFnZSAgICAgICBcbiAqIC0gZ3dlaSAgICAgICBuYW5vZXRoZXIgICAgICBzaGFubm9uICAgICAgbmFub1xuICogLSAtLSAgICAgICAgIG1pY3JvZXRoZXIgICAgIHN6YWJvICAgICAgICBtaWNyb1xuICogLSAtLSAgICAgICAgIG1pbGxpZXRoZXIgICAgIGZpbm5leSAgICAgICBtaWxsaVxuICogLSBldGhlciAgICAgIC0tICAgICAgICAgICAgIC0tXG4gKiAtIGtldGhlciAgICAgICAgICAgICAgICAgICAgZWluc3RlaW4gICAgIGdyYW5kIFxuICogLSBtZXRoZXJcbiAqIC0gZ2V0aGVyXG4gKiAtIHRldGhlclxuICpcbiAqIEBtZXRob2QgdG9XZWlcbiAqIEBwYXJhbSB7TnVtYmVyfFN0cmluZ3xCaWdOdW1iZXJ9IG51bWJlciBjYW4gYmUgYSBudW1iZXIsIG51bWJlciBzdHJpbmcgb3IgYSBIRVggb2YgYSBkZWNpbWFsXG4gKiBAcGFyYW0ge1N0cmluZ30gdW5pdCB0aGUgdW5pdCB0byBjb252ZXJ0IGZyb20sIGRlZmF1bHQgZXRoZXJcbiAqIEByZXR1cm4ge1N0cmluZ3xPYmplY3R9IFdoZW4gZ2l2ZW4gYSBCaWdOdW1iZXIgb2JqZWN0IGl0IHJldHVybnMgb25lIGFzIHdlbGwsIG90aGVyd2lzZSBhIG51bWJlclxuKi9cbnZhciB0b1dlaSA9IGZ1bmN0aW9uKG51bWJlciwgdW5pdCkge1xuICAgIHZhciByZXR1cm5WYWx1ZSA9IHRvQmlnTnVtYmVyKG51bWJlcikudGltZXMoZ2V0VmFsdWVPZlVuaXQodW5pdCkpO1xuXG4gICAgcmV0dXJuIGlzQmlnTnVtYmVyKG51bWJlcikgPyByZXR1cm5WYWx1ZSA6IHJldHVyblZhbHVlLnRvU3RyaW5nKDEwKTsgXG59O1xuXG4vKipcbiAqIFRha2VzIGFuIGlucHV0IGFuZCB0cmFuc2Zvcm1zIGl0IGludG8gYW4gYmlnbnVtYmVyXG4gKlxuICogQG1ldGhvZCB0b0JpZ051bWJlclxuICogQHBhcmFtIHtOdW1iZXJ8U3RyaW5nfEJpZ051bWJlcn0gYSBudW1iZXIsIHN0cmluZywgSEVYIHN0cmluZyBvciBCaWdOdW1iZXJcbiAqIEByZXR1cm4ge0JpZ051bWJlcn0gQmlnTnVtYmVyXG4qL1xudmFyIHRvQmlnTnVtYmVyID0gZnVuY3Rpb24obnVtYmVyKSB7XG4gICAgLypqc2hpbnQgbWF4Y29tcGxleGl0eTo1ICovXG4gICAgbnVtYmVyID0gbnVtYmVyIHx8IDA7XG4gICAgaWYgKGlzQmlnTnVtYmVyKG51bWJlcikpXG4gICAgICAgIHJldHVybiBudW1iZXI7XG5cbiAgICBpZiAoaXNTdHJpbmcobnVtYmVyKSAmJiAobnVtYmVyLmluZGV4T2YoJzB4JykgPT09IDAgfHwgbnVtYmVyLmluZGV4T2YoJy0weCcpID09PSAwKSkge1xuICAgICAgICByZXR1cm4gbmV3IEJpZ051bWJlcihudW1iZXIucmVwbGFjZSgnMHgnLCcnKSwgMTYpO1xuICAgIH1cbiAgIFxuICAgIHJldHVybiBuZXcgQmlnTnVtYmVyKG51bWJlci50b1N0cmluZygxMCksIDEwKTtcbn07XG5cbi8qKlxuICogVGFrZXMgYW5kIGlucHV0IHRyYW5zZm9ybXMgaXQgaW50byBiaWdudW1iZXIgYW5kIGlmIGl0IGlzIG5lZ2F0aXZlIHZhbHVlLCBpbnRvIHR3bydzIGNvbXBsZW1lbnRcbiAqXG4gKiBAbWV0aG9kIHRvVHdvc0NvbXBsZW1lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfFN0cmluZ3xCaWdOdW1iZXJ9XG4gKiBAcmV0dXJuIHtCaWdOdW1iZXJ9XG4gKi9cbnZhciB0b1R3b3NDb21wbGVtZW50ID0gZnVuY3Rpb24gKG51bWJlcikge1xuICAgIHZhciBiaWdOdW1iZXIgPSB0b0JpZ051bWJlcihudW1iZXIpO1xuICAgIGlmIChiaWdOdW1iZXIubGVzc1RoYW4oMCkpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBCaWdOdW1iZXIoXCJmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmXCIsIDE2KS5wbHVzKGJpZ051bWJlcikucGx1cygxKTtcbiAgICB9XG4gICAgcmV0dXJuIGJpZ051bWJlcjtcbn07XG5cbi8qKlxuICogQ2hlY2tzIGlmIHRoZSBnaXZlbiBzdHJpbmcgaXMgc3RyaWN0bHkgYW4gYWRkcmVzc1xuICpcbiAqIEBtZXRob2QgaXNTdHJpY3RBZGRyZXNzXG4gKiBAcGFyYW0ge1N0cmluZ30gYWRkcmVzcyB0aGUgZ2l2ZW4gSEVYIGFkcmVzc1xuICogQHJldHVybiB7Qm9vbGVhbn1cbiovXG52YXIgaXNTdHJpY3RBZGRyZXNzID0gZnVuY3Rpb24gKGFkZHJlc3MpIHtcbiAgICByZXR1cm4gL14weFswLTlhLWZdezQwfSQvLnRlc3QoYWRkcmVzcyk7XG59O1xuXG4vKipcbiAqIENoZWNrcyBpZiB0aGUgZ2l2ZW4gc3RyaW5nIGlzIGFuIGFkZHJlc3NcbiAqXG4gKiBAbWV0aG9kIGlzQWRkcmVzc1xuICogQHBhcmFtIHtTdHJpbmd9IGFkZHJlc3MgdGhlIGdpdmVuIEhFWCBhZHJlc3NcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4qL1xudmFyIGlzQWRkcmVzcyA9IGZ1bmN0aW9uIChhZGRyZXNzKSB7XG4gICAgcmV0dXJuIC9eKDB4KT9bMC05YS1mXXs0MH0kLy50ZXN0KGFkZHJlc3MpO1xufTtcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIGdpdmVuIHN0cmluZyB0byB2YWxpZCAyMCBieXRlcy1sZW5ndGggYWRkcmVzIHdpdGggMHggcHJlZml4XG4gKlxuICogQG1ldGhvZCB0b0FkZHJlc3NcbiAqIEBwYXJhbSB7U3RyaW5nfSBhZGRyZXNzXG4gKiBAcmV0dXJuIHtTdHJpbmd9IGZvcm1hdHRlZCBhZGRyZXNzXG4gKi9cbnZhciB0b0FkZHJlc3MgPSBmdW5jdGlvbiAoYWRkcmVzcykge1xuICAgIGlmIChpc1N0cmljdEFkZHJlc3MoYWRkcmVzcykpIHtcbiAgICAgICAgcmV0dXJuIGFkZHJlc3M7XG4gICAgfVxuICAgIFxuICAgIGlmICgvXlswLTlhLWZdezQwfSQvLnRlc3QoYWRkcmVzcykpIHtcbiAgICAgICAgcmV0dXJuICcweCcgKyBhZGRyZXNzO1xuICAgIH1cblxuICAgIHJldHVybiAnMHgnICsgcGFkTGVmdCh0b0hleChhZGRyZXNzKS5zdWJzdHIoMiksIDQwKTtcbn07XG5cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgb2JqZWN0IGlzIEJpZ051bWJlciwgb3RoZXJ3aXNlIGZhbHNlXG4gKlxuICogQG1ldGhvZCBpc0JpZ051bWJlclxuICogQHBhcmFtIHtPYmplY3R9XG4gKiBAcmV0dXJuIHtCb29sZWFufSBcbiAqL1xudmFyIGlzQmlnTnVtYmVyID0gZnVuY3Rpb24gKG9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3QgaW5zdGFuY2VvZiBCaWdOdW1iZXIgfHxcbiAgICAgICAgKG9iamVjdCAmJiBvYmplY3QuY29uc3RydWN0b3IgJiYgb2JqZWN0LmNvbnN0cnVjdG9yLm5hbWUgPT09ICdCaWdOdW1iZXInKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIG9iamVjdCBpcyBzdHJpbmcsIG90aGVyd2lzZSBmYWxzZVxuICogXG4gKiBAbWV0aG9kIGlzU3RyaW5nXG4gKiBAcGFyYW0ge09iamVjdH1cbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKi9cbnZhciBpc1N0cmluZyA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICByZXR1cm4gdHlwZW9mIG9iamVjdCA9PT0gJ3N0cmluZycgfHxcbiAgICAgICAgKG9iamVjdCAmJiBvYmplY3QuY29uc3RydWN0b3IgJiYgb2JqZWN0LmNvbnN0cnVjdG9yLm5hbWUgPT09ICdTdHJpbmcnKTtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIG9iamVjdCBpcyBmdW5jdGlvbiwgb3RoZXJ3aXNlIGZhbHNlXG4gKlxuICogQG1ldGhvZCBpc0Z1bmN0aW9uXG4gKiBAcGFyYW0ge09iamVjdH1cbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKi9cbnZhciBpc0Z1bmN0aW9uID0gZnVuY3Rpb24gKG9iamVjdCkge1xuICAgIHJldHVybiB0eXBlb2Ygb2JqZWN0ID09PSAnZnVuY3Rpb24nO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgb2JqZWN0IGlzIE9iamV0LCBvdGhlcndpc2UgZmFsc2VcbiAqXG4gKiBAbWV0aG9kIGlzT2JqZWN0XG4gKiBAcGFyYW0ge09iamVjdH1cbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKi9cbnZhciBpc09iamVjdCA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICByZXR1cm4gdHlwZW9mIG9iamVjdCA9PT0gJ29iamVjdCc7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiBvYmplY3QgaXMgYm9vbGVhbiwgb3RoZXJ3aXNlIGZhbHNlXG4gKlxuICogQG1ldGhvZCBpc0Jvb2xlYW5cbiAqIEBwYXJhbSB7T2JqZWN0fVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqL1xudmFyIGlzQm9vbGVhbiA9IGZ1bmN0aW9uIChvYmplY3QpIHtcbiAgICByZXR1cm4gdHlwZW9mIG9iamVjdCA9PT0gJ2Jvb2xlYW4nO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgb2JqZWN0IGlzIGFycmF5LCBvdGhlcndpc2UgZmFsc2VcbiAqXG4gKiBAbWV0aG9kIGlzQXJyYXlcbiAqIEBwYXJhbSB7T2JqZWN0fVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqL1xudmFyIGlzQXJyYXkgPSBmdW5jdGlvbiAob2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdCBpbnN0YW5jZW9mIEFycmF5OyBcbn07XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIGdpdmVuIHN0cmluZyBpcyB2YWxpZCBqc29uIG9iamVjdFxuICogXG4gKiBAbWV0aG9kIGlzSnNvblxuICogQHBhcmFtIHtTdHJpbmd9XG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICovXG52YXIgaXNKc29uID0gZnVuY3Rpb24gKHN0cikge1xuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiAhIUpTT04ucGFyc2Uoc3RyKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG59O1xuXG4vKipcbiAqIFRoaXMgbWV0aG9kIHNob3VsZCBiZSBjYWxsZWQgdG8gY2hlY2sgaWYgc3RyaW5nIGlzIHZhbGlkIGV0aGVyZXVtIElCQU4gbnVtYmVyXG4gKiBTdXBwb3J0cyBkaXJlY3QgYW5kIGluZGlyZWN0IElCQU5zXG4gKlxuICogQG1ldGhvZCBpc0lCQU5cbiAqIEBwYXJhbSB7U3RyaW5nfVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqL1xudmFyIGlzSUJBTiA9IGZ1bmN0aW9uIChpYmFuKSB7XG4gICAgcmV0dXJuIC9eWEVbMC05XXsyfShFVEhbMC05QS1aXXsxM318WzAtOUEtWl17MzB9KSQvLnRlc3QoaWJhbik7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBwYWRMZWZ0OiBwYWRMZWZ0LFxuICAgIHRvSGV4OiB0b0hleCxcbiAgICB0b0RlY2ltYWw6IHRvRGVjaW1hbCxcbiAgICBmcm9tRGVjaW1hbDogZnJvbURlY2ltYWwsXG4gICAgdG9Bc2NpaTogdG9Bc2NpaSxcbiAgICBmcm9tQXNjaWk6IGZyb21Bc2NpaSxcbiAgICB0cmFuc2Zvcm1Ub0Z1bGxOYW1lOiB0cmFuc2Zvcm1Ub0Z1bGxOYW1lLFxuICAgIGV4dHJhY3REaXNwbGF5TmFtZTogZXh0cmFjdERpc3BsYXlOYW1lLFxuICAgIGV4dHJhY3RUeXBlTmFtZTogZXh0cmFjdFR5cGVOYW1lLFxuICAgIHRvV2VpOiB0b1dlaSxcbiAgICBmcm9tV2VpOiBmcm9tV2VpLFxuICAgIHRvQmlnTnVtYmVyOiB0b0JpZ051bWJlcixcbiAgICB0b1R3b3NDb21wbGVtZW50OiB0b1R3b3NDb21wbGVtZW50LFxuICAgIHRvQWRkcmVzczogdG9BZGRyZXNzLFxuICAgIGlzQmlnTnVtYmVyOiBpc0JpZ051bWJlcixcbiAgICBpc1N0cmljdEFkZHJlc3M6IGlzU3RyaWN0QWRkcmVzcyxcbiAgICBpc0FkZHJlc3M6IGlzQWRkcmVzcyxcbiAgICBpc0Z1bmN0aW9uOiBpc0Z1bmN0aW9uLFxuICAgIGlzU3RyaW5nOiBpc1N0cmluZyxcbiAgICBpc09iamVjdDogaXNPYmplY3QsXG4gICAgaXNCb29sZWFuOiBpc0Jvb2xlYW4sXG4gICAgaXNBcnJheTogaXNBcnJheSxcbiAgICBpc0pzb246IGlzSnNvbixcbiAgICBpc0lCQU46IGlzSUJBTlxufTtcblxuIiwibW9kdWxlLmV4cG9ydHM9e1xuICAgIFwidmVyc2lvblwiOiBcIjAuNS4wXCJcbn1cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIEBmaWxlIHdlYjMuanNcbiAqIEBhdXRob3JzOlxuICogICBKZWZmcmV5IFdpbGNrZSA8amVmZkBldGhkZXYuY29tPlxuICogICBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqICAgTWFyaWFuIE9hbmNlYSA8bWFyaWFuQGV0aGRldi5jb20+XG4gKiAgIEZhYmlhbiBWb2dlbHN0ZWxsZXIgPGZhYmlhbkBldGhkZXYuY29tPlxuICogICBHYXYgV29vZCA8Z0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNFxuICovXG5cbnZhciB2ZXJzaW9uID0gcmVxdWlyZSgnLi92ZXJzaW9uLmpzb24nKTtcbnZhciBuZXQgPSByZXF1aXJlKCcuL3dlYjMvbmV0Jyk7XG52YXIgZXRoID0gcmVxdWlyZSgnLi93ZWIzL2V0aCcpO1xudmFyIGRiID0gcmVxdWlyZSgnLi93ZWIzL2RiJyk7XG52YXIgc2hoID0gcmVxdWlyZSgnLi93ZWIzL3NoaCcpO1xudmFyIHdhdGNoZXMgPSByZXF1aXJlKCcuL3dlYjMvd2F0Y2hlcycpO1xudmFyIEZpbHRlciA9IHJlcXVpcmUoJy4vd2ViMy9maWx0ZXInKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMvdXRpbHMnKTtcbnZhciBmb3JtYXR0ZXJzID0gcmVxdWlyZSgnLi93ZWIzL2Zvcm1hdHRlcnMnKTtcbnZhciBSZXF1ZXN0TWFuYWdlciA9IHJlcXVpcmUoJy4vd2ViMy9yZXF1ZXN0bWFuYWdlcicpO1xudmFyIE1ldGhvZCA9IHJlcXVpcmUoJy4vd2ViMy9tZXRob2QnKTtcbnZhciBjID0gcmVxdWlyZSgnLi91dGlscy9jb25maWcnKTtcbnZhciBQcm9wZXJ0eSA9IHJlcXVpcmUoJy4vd2ViMy9wcm9wZXJ0eScpO1xudmFyIEJhdGNoID0gcmVxdWlyZSgnLi93ZWIzL2JhdGNoJyk7XG52YXIgc2hhMyA9IHJlcXVpcmUoJy4vdXRpbHMvc2hhMycpO1xuXG52YXIgd2ViM1Byb3BlcnRpZXMgPSBbXG4gICAgbmV3IFByb3BlcnR5KHtcbiAgICAgICAgbmFtZTogJ3ZlcnNpb24uY2xpZW50JyxcbiAgICAgICAgZ2V0dGVyOiAnd2ViM19jbGllbnRWZXJzaW9uJ1xuICAgIH0pLFxuICAgIG5ldyBQcm9wZXJ0eSh7XG4gICAgICAgIG5hbWU6ICd2ZXJzaW9uLm5ldHdvcmsnLFxuICAgICAgICBnZXR0ZXI6ICduZXRfdmVyc2lvbicsXG4gICAgICAgIGlucHV0Rm9ybWF0dGVyOiB1dGlscy50b0RlY2ltYWxcbiAgICB9KSxcbiAgICBuZXcgUHJvcGVydHkoe1xuICAgICAgICBuYW1lOiAndmVyc2lvbi5ldGhlcmV1bScsXG4gICAgICAgIGdldHRlcjogJ2V0aF9wcm90b2NvbFZlcnNpb24nLFxuICAgICAgICBpbnB1dEZvcm1hdHRlcjogdXRpbHMudG9EZWNpbWFsXG4gICAgfSksXG4gICAgbmV3IFByb3BlcnR5KHtcbiAgICAgICAgbmFtZTogJ3ZlcnNpb24ud2hpc3BlcicsXG4gICAgICAgIGdldHRlcjogJ3NoaF92ZXJzaW9uJyxcbiAgICAgICAgaW5wdXRGb3JtYXR0ZXI6IHV0aWxzLnRvRGVjaW1hbFxuICAgIH0pXG5dO1xuXG4vLy8gY3JlYXRlcyBtZXRob2RzIGluIGEgZ2l2ZW4gb2JqZWN0IGJhc2VkIG9uIG1ldGhvZCBkZXNjcmlwdGlvbiBvbiBpbnB1dFxuLy8vIHNldHVwcyBhcGkgY2FsbHMgZm9yIHRoZXNlIG1ldGhvZHNcbnZhciBzZXR1cE1ldGhvZHMgPSBmdW5jdGlvbiAob2JqLCBtZXRob2RzKSB7XG4gICAgbWV0aG9kcy5mb3JFYWNoKGZ1bmN0aW9uIChtZXRob2QpIHtcbiAgICAgICAgbWV0aG9kLmF0dGFjaFRvT2JqZWN0KG9iaik7XG4gICAgfSk7XG59O1xuXG4vLy8gY3JlYXRlcyBwcm9wZXJ0aWVzIGluIGEgZ2l2ZW4gb2JqZWN0IGJhc2VkIG9uIHByb3BlcnRpZXMgZGVzY3JpcHRpb24gb24gaW5wdXRcbi8vLyBzZXR1cHMgYXBpIGNhbGxzIGZvciB0aGVzZSBwcm9wZXJ0aWVzXG52YXIgc2V0dXBQcm9wZXJ0aWVzID0gZnVuY3Rpb24gKG9iaiwgcHJvcGVydGllcykge1xuICAgIHByb3BlcnRpZXMuZm9yRWFjaChmdW5jdGlvbiAocHJvcGVydHkpIHtcbiAgICAgICAgcHJvcGVydHkuYXR0YWNoVG9PYmplY3Qob2JqKTtcbiAgICB9KTtcbn07XG5cbi8vLyBzZXR1cHMgd2ViMyBvYmplY3QsIGFuZCBpdCdzIGluLWJyb3dzZXIgZXhlY3V0ZWQgbWV0aG9kc1xudmFyIHdlYjMgPSB7fTtcbndlYjMucHJvdmlkZXJzID0ge307XG53ZWIzLnZlcnNpb24gPSB7fTtcbndlYjMudmVyc2lvbi5hcGkgPSB2ZXJzaW9uLnZlcnNpb247XG53ZWIzLmV0aCA9IHt9O1xuXG4vKmpzaGludCBtYXhwYXJhbXM6NCAqL1xud2ViMy5ldGguZmlsdGVyID0gZnVuY3Rpb24gKGZpbCwgZXZlbnRQYXJhbXMsIG9wdGlvbnMsIGZvcm1hdHRlcikge1xuXG4gICAgLy8gaWYgaXRzIGV2ZW50LCB0cmVhdCBpdCBkaWZmZXJlbnRseVxuICAgIC8vIFRPRE86IHNpbXBsaWZ5IGFuZCByZW1vdmVcbiAgICBpZiAoZmlsLl9pc0V2ZW50KSB7XG4gICAgICAgIHJldHVybiBmaWwoZXZlbnRQYXJhbXMsIG9wdGlvbnMpO1xuICAgIH1cblxuICAgIC8vIHdoYXQgb3V0cHV0TG9nRm9ybWF0dGVyPyB0aGF0J3Mgd3JvbmdcbiAgICAvL3JldHVybiBuZXcgRmlsdGVyKGZpbCwgd2F0Y2hlcy5ldGgoKSwgZm9ybWF0dGVycy5vdXRwdXRMb2dGb3JtYXR0ZXIpO1xuICAgIHJldHVybiBuZXcgRmlsdGVyKGZpbCwgd2F0Y2hlcy5ldGgoKSwgZm9ybWF0dGVyIHx8IGZvcm1hdHRlcnMub3V0cHV0TG9nRm9ybWF0dGVyKTtcbn07XG4vKmpzaGludCBtYXhwYXJhbXM6MyAqL1xuXG53ZWIzLnNoaCA9IHt9O1xud2ViMy5zaGguZmlsdGVyID0gZnVuY3Rpb24gKGZpbCkge1xuICAgIHJldHVybiBuZXcgRmlsdGVyKGZpbCwgd2F0Y2hlcy5zaGgoKSwgZm9ybWF0dGVycy5vdXRwdXRQb3N0Rm9ybWF0dGVyKTtcbn07XG53ZWIzLm5ldCA9IHt9O1xud2ViMy5kYiA9IHt9O1xud2ViMy5zZXRQcm92aWRlciA9IGZ1bmN0aW9uIChwcm92aWRlcikge1xuICAgIFJlcXVlc3RNYW5hZ2VyLmdldEluc3RhbmNlKCkuc2V0UHJvdmlkZXIocHJvdmlkZXIpO1xufTtcbndlYjMucmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgUmVxdWVzdE1hbmFnZXIuZ2V0SW5zdGFuY2UoKS5yZXNldCgpO1xuICAgIGMuZGVmYXVsdEJsb2NrID0gJ2xhdGVzdCc7XG4gICAgYy5kZWZhdWx0QWNjb3VudCA9IHVuZGVmaW5lZDtcbn07XG53ZWIzLnRvSGV4ID0gdXRpbHMudG9IZXg7XG53ZWIzLnRvQXNjaWkgPSB1dGlscy50b0FzY2lpO1xud2ViMy5mcm9tQXNjaWkgPSB1dGlscy5mcm9tQXNjaWk7XG53ZWIzLnRvRGVjaW1hbCA9IHV0aWxzLnRvRGVjaW1hbDtcbndlYjMuZnJvbURlY2ltYWwgPSB1dGlscy5mcm9tRGVjaW1hbDtcbndlYjMudG9CaWdOdW1iZXIgPSB1dGlscy50b0JpZ051bWJlcjtcbndlYjMudG9XZWkgPSB1dGlscy50b1dlaTtcbndlYjMuZnJvbVdlaSA9IHV0aWxzLmZyb21XZWk7XG53ZWIzLmlzQWRkcmVzcyA9IHV0aWxzLmlzQWRkcmVzcztcbndlYjMuaXNJQkFOID0gdXRpbHMuaXNJQkFOO1xud2ViMy5zaGEzID0gc2hhMztcbndlYjMuY3JlYXRlQmF0Y2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIG5ldyBCYXRjaCgpO1xufTtcblxuLy8gQUREIGRlZmF1bHRibG9ja1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KHdlYjMuZXRoLCAnZGVmYXVsdEJsb2NrJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gYy5kZWZhdWx0QmxvY2s7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uICh2YWwpIHtcbiAgICAgICAgYy5kZWZhdWx0QmxvY2sgPSB2YWw7XG4gICAgICAgIHJldHVybiB2YWw7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eSh3ZWIzLmV0aCwgJ2RlZmF1bHRBY2NvdW50Jywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gYy5kZWZhdWx0QWNjb3VudDtcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24gKHZhbCkge1xuICAgICAgICBjLmRlZmF1bHRBY2NvdW50ID0gdmFsO1xuICAgICAgICByZXR1cm4gdmFsO1xuICAgIH1cbn0pO1xuXG4vLy8gc2V0dXBzIGFsbCBhcGkgbWV0aG9kc1xuc2V0dXBQcm9wZXJ0aWVzKHdlYjMsIHdlYjNQcm9wZXJ0aWVzKTtcbnNldHVwTWV0aG9kcyh3ZWIzLm5ldCwgbmV0Lm1ldGhvZHMpO1xuc2V0dXBQcm9wZXJ0aWVzKHdlYjMubmV0LCBuZXQucHJvcGVydGllcyk7XG5zZXR1cE1ldGhvZHMod2ViMy5ldGgsIGV0aC5tZXRob2RzKTtcbnNldHVwUHJvcGVydGllcyh3ZWIzLmV0aCwgZXRoLnByb3BlcnRpZXMpO1xuc2V0dXBNZXRob2RzKHdlYjMuZGIsIGRiLm1ldGhvZHMpO1xuc2V0dXBNZXRob2RzKHdlYjMuc2hoLCBzaGgubWV0aG9kcyk7XG5cbndlYjMuYWRtaW4gPSB7fTtcbndlYjMuYWRtaW4uc2V0U2Vzc2lvbktleSA9IGZ1bmN0aW9uKHMpIHsgd2ViMy5hZG1pbi5zZXNzaW9uS2V5ID0gczsgfTtcblxudmFyIGJsb2NrUXVldWVTdGF0dXMgPSBuZXcgTWV0aG9kKHtcblx0bmFtZTogJ2Jsb2NrUXVldWVTdGF0dXMnLFxuXHRjYWxsOiAnYWRtaW5fZXRoX2Jsb2NrUXVldWVTdGF0dXMnLFxuXHRwYXJhbXM6IDEsXG5cdGlucHV0Rm9ybWF0dGVyOiBbZnVuY3Rpb24oKSB7IHJldHVybiB3ZWIzLmFkbWluLnNlc3Npb25LZXk7IH1dXG59KTtcblxuc2V0dXBNZXRob2RzKHdlYjMuYWRtaW4sIFtibG9ja1F1ZXVlU3RhdHVzXSk7XG5cbm1vZHVsZS5leHBvcnRzID0gd2ViMztcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogXG4gKiBAZmlsZSBiYXRjaC5qc1xuICogQGF1dGhvciBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG52YXIgUmVxdWVzdE1hbmFnZXIgPSByZXF1aXJlKCcuL3JlcXVlc3RtYW5hZ2VyJyk7XG5cbnZhciBCYXRjaCA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLnJlcXVlc3RzID0gW107XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gYWRkIGNyZWF0ZSBuZXcgcmVxdWVzdCB0byBiYXRjaCByZXF1ZXN0XG4gKlxuICogQG1ldGhvZCBhZGRcbiAqIEBwYXJhbSB7T2JqZWN0fSBqc29ucnBjIHJlcXVldCBvYmplY3RcbiAqL1xuQmF0Y2gucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uIChyZXF1ZXN0KSB7XG4gICAgdGhpcy5yZXF1ZXN0cy5wdXNoKHJlcXVlc3QpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGV4ZWN1dGUgYmF0Y2ggcmVxdWVzdFxuICpcbiAqIEBtZXRob2QgZXhlY3V0ZVxuICovXG5CYXRjaC5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgcmVxdWVzdHMgPSB0aGlzLnJlcXVlc3RzO1xuICAgIFJlcXVlc3RNYW5hZ2VyLmdldEluc3RhbmNlKCkuc2VuZEJhdGNoKHJlcXVlc3RzLCBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgICAgIHJlc3VsdHMgPSByZXN1bHRzIHx8IFtdO1xuICAgICAgICByZXF1ZXN0cy5tYXAoZnVuY3Rpb24gKHJlcXVlc3QsIGluZGV4KSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0c1tpbmRleF0gfHwge307XG4gICAgICAgIH0pLm1hcChmdW5jdGlvbiAocmVzdWx0LCBpbmRleCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlcXVlc3RzW2luZGV4XS5mb3JtYXQgPyByZXF1ZXN0c1tpbmRleF0uZm9ybWF0KHJlc3VsdC5yZXN1bHQpIDogcmVzdWx0LnJlc3VsdDtcbiAgICAgICAgfSkuZm9yRWFjaChmdW5jdGlvbiAocmVzdWx0LCBpbmRleCkge1xuICAgICAgICAgICAgaWYgKHJlcXVlc3RzW2luZGV4XS5jYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHJlcXVlc3RzW2luZGV4XS5jYWxsYmFjayhlcnIsIHJlc3VsdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH0pOyBcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQmF0Y2g7XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIFxuICogQGZpbGUgY29udHJhY3QuanNcbiAqIEBhdXRob3IgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiBAZGF0ZSAyMDE0XG4gKi9cblxudmFyIHdlYjMgPSByZXF1aXJlKCcuLi93ZWIzJyk7IFxudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcbnZhciBjb2RlciA9IHJlcXVpcmUoJy4uL3NvbGlkaXR5L2NvZGVyJyk7XG52YXIgU29saWRpdHlFdmVudCA9IHJlcXVpcmUoJy4vZXZlbnQnKTtcbnZhciBTb2xpZGl0eUZ1bmN0aW9uID0gcmVxdWlyZSgnLi9mdW5jdGlvbicpO1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gZW5jb2RlIGNvbnN0cnVjdG9yIHBhcmFtc1xuICpcbiAqIEBtZXRob2QgZW5jb2RlQ29uc3RydWN0b3JQYXJhbXNcbiAqIEBwYXJhbSB7QXJyYXl9IGFiaVxuICogQHBhcmFtIHtBcnJheX0gY29uc3RydWN0b3IgcGFyYW1zXG4gKi9cbnZhciBlbmNvZGVDb25zdHJ1Y3RvclBhcmFtcyA9IGZ1bmN0aW9uIChhYmksIHBhcmFtcykge1xuICAgIHJldHVybiBhYmkuZmlsdGVyKGZ1bmN0aW9uIChqc29uKSB7XG4gICAgICAgIHJldHVybiBqc29uLnR5cGUgPT09ICdjb25zdHJ1Y3RvcicgJiYganNvbi5pbnB1dHMubGVuZ3RoID09PSBwYXJhbXMubGVuZ3RoO1xuICAgIH0pLm1hcChmdW5jdGlvbiAoanNvbikge1xuICAgICAgICByZXR1cm4ganNvbi5pbnB1dHMubWFwKGZ1bmN0aW9uIChpbnB1dCkge1xuICAgICAgICAgICAgcmV0dXJuIGlucHV0LnR5cGU7XG4gICAgICAgIH0pO1xuICAgIH0pLm1hcChmdW5jdGlvbiAodHlwZXMpIHtcbiAgICAgICAgcmV0dXJuIGNvZGVyLmVuY29kZVBhcmFtcyh0eXBlcywgcGFyYW1zKTtcbiAgICB9KVswXSB8fCAnJztcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBhZGQgZnVuY3Rpb25zIHRvIGNvbnRyYWN0IG9iamVjdFxuICpcbiAqIEBtZXRob2QgYWRkRnVuY3Rpb25zVG9Db250cmFjdFxuICogQHBhcmFtIHtDb250cmFjdH0gY29udHJhY3RcbiAqIEBwYXJhbSB7QXJyYXl9IGFiaVxuICovXG52YXIgYWRkRnVuY3Rpb25zVG9Db250cmFjdCA9IGZ1bmN0aW9uIChjb250cmFjdCwgYWJpKSB7XG4gICAgYWJpLmZpbHRlcihmdW5jdGlvbiAoanNvbikge1xuICAgICAgICByZXR1cm4ganNvbi50eXBlID09PSAnZnVuY3Rpb24nO1xuICAgIH0pLm1hcChmdW5jdGlvbiAoanNvbikge1xuICAgICAgICByZXR1cm4gbmV3IFNvbGlkaXR5RnVuY3Rpb24oanNvbiwgY29udHJhY3QuYWRkcmVzcyk7XG4gICAgfSkuZm9yRWFjaChmdW5jdGlvbiAoZikge1xuICAgICAgICBmLmF0dGFjaFRvQ29udHJhY3QoY29udHJhY3QpO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGFkZCBldmVudHMgdG8gY29udHJhY3Qgb2JqZWN0XG4gKlxuICogQG1ldGhvZCBhZGRFdmVudHNUb0NvbnRyYWN0XG4gKiBAcGFyYW0ge0NvbnRyYWN0fSBjb250cmFjdFxuICogQHBhcmFtIHtBcnJheX0gYWJpXG4gKi9cbnZhciBhZGRFdmVudHNUb0NvbnRyYWN0ID0gZnVuY3Rpb24gKGNvbnRyYWN0LCBhYmkpIHtcbiAgICBhYmkuZmlsdGVyKGZ1bmN0aW9uIChqc29uKSB7XG4gICAgICAgIHJldHVybiBqc29uLnR5cGUgPT09ICdldmVudCc7XG4gICAgfSkubWFwKGZ1bmN0aW9uIChqc29uKSB7XG4gICAgICAgIHJldHVybiBuZXcgU29saWRpdHlFdmVudChqc29uLCBjb250cmFjdC5hZGRyZXNzKTtcbiAgICB9KS5mb3JFYWNoKGZ1bmN0aW9uIChlKSB7XG4gICAgICAgIGUuYXR0YWNoVG9Db250cmFjdChjb250cmFjdCk7XG4gICAgfSk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gY3JlYXRlIG5ldyBDb250cmFjdEZhY3RvcnlcbiAqXG4gKiBAbWV0aG9kIGNvbnRyYWN0XG4gKiBAcGFyYW0ge0FycmF5fSBhYmlcbiAqIEByZXR1cm5zIHtDb250cmFjdEZhY3Rvcnl9IG5ldyBjb250cmFjdCBmYWN0b3J5XG4gKi9cbnZhciBjb250cmFjdCA9IGZ1bmN0aW9uIChhYmkpIHtcbiAgICByZXR1cm4gbmV3IENvbnRyYWN0RmFjdG9yeShhYmkpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGNyZWF0ZSBuZXcgQ29udHJhY3RGYWN0b3J5IGluc3RhbmNlXG4gKlxuICogQG1ldGhvZCBDb250cmFjdEZhY3RvcnlcbiAqIEBwYXJhbSB7QXJyYXl9IGFiaVxuICovXG52YXIgQ29udHJhY3RGYWN0b3J5ID0gZnVuY3Rpb24gKGFiaSkge1xuICAgIHRoaXMuYWJpID0gYWJpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGNyZWF0ZSBuZXcgY29udHJhY3Qgb24gYSBibG9ja2NoYWluXG4gKiBcbiAqIEBtZXRob2QgbmV3XG4gKiBAcGFyYW0ge0FueX0gY29udHJhY3QgY29uc3RydWN0b3IgcGFyYW0xIChvcHRpb25hbClcbiAqIEBwYXJhbSB7QW55fSBjb250cmFjdCBjb25zdHJ1Y3RvciBwYXJhbTIgKG9wdGlvbmFsKVxuICogQHBhcmFtIHtPYmplY3R9IGNvbnRyYWN0IHRyYW5zYWN0aW9uIG9iamVjdCAocmVxdWlyZWQpXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFja1xuICogQHJldHVybnMge0NvbnRyYWN0fSByZXR1cm5zIGNvbnRyYWN0IGlmIG5vIGNhbGxiYWNrIHdhcyBwYXNzZWQsXG4gKiBvdGhlcndpc2UgY2FsbHMgY2FsbGJhY2sgZnVuY3Rpb24gKGVyciwgY29udHJhY3QpXG4gKi9cbkNvbnRyYWN0RmFjdG9yeS5wcm90b3R5cGUubmV3ID0gZnVuY3Rpb24gKCkge1xuICAgIC8vIHBhcnNlIGFyZ3VtZW50c1xuICAgIHZhciBvcHRpb25zID0ge307IC8vIHJlcXVpcmVkIVxuICAgIHZhciBjYWxsYmFjaztcblxuICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICBpZiAodXRpbHMuaXNGdW5jdGlvbihhcmdzW2FyZ3MubGVuZ3RoIC0gMV0pKSB7XG4gICAgICAgIGNhbGxiYWNrID0gYXJncy5wb3AoKTtcbiAgICB9XG5cbiAgICB2YXIgbGFzdCA9IGFyZ3NbYXJncy5sZW5ndGggLSAxXTtcbiAgICBpZiAodXRpbHMuaXNPYmplY3QobGFzdCkgJiYgIXV0aWxzLmlzQXJyYXkobGFzdCkpIHtcbiAgICAgICAgb3B0aW9ucyA9IGFyZ3MucG9wKCk7XG4gICAgfVxuXG4gICAgLy8gdGhyb3cgYW4gZXJyb3IgaWYgdGhlcmUgYXJlIG5vIG9wdGlvbnNcblxuICAgIHZhciBieXRlcyA9IGVuY29kZUNvbnN0cnVjdG9yUGFyYW1zKHRoaXMuYWJpLCBhcmdzKTtcbiAgICBvcHRpb25zLmRhdGEgKz0gYnl0ZXM7XG5cbiAgICBpZiAoIWNhbGxiYWNrKSB7XG4gICAgICAgIHZhciBhZGRyZXNzID0gd2ViMy5ldGguc2VuZFRyYW5zYWN0aW9uKG9wdGlvbnMpO1xuICAgICAgICByZXR1cm4gdGhpcy5hdChhZGRyZXNzKTtcbiAgICB9XG4gIFxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB3ZWIzLmV0aC5zZW5kVHJhbnNhY3Rpb24ob3B0aW9ucywgZnVuY3Rpb24gKGVyciwgYWRkcmVzcykge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlcnIpO1xuICAgICAgICB9XG4gICAgICAgIHNlbGYuYXQoYWRkcmVzcywgY2FsbGJhY2spOyBcbiAgICB9KTsgXG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gZ2V0IGFjY2VzcyB0byBleGlzdGluZyBjb250cmFjdCBvbiBhIGJsb2NrY2hhaW5cbiAqXG4gKiBAbWV0aG9kIGF0XG4gKiBAcGFyYW0ge0FkZHJlc3N9IGNvbnRyYWN0IGFkZHJlc3MgKHJlcXVpcmVkKVxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sge29wdGlvbmFsKVxuICogQHJldHVybnMge0NvbnRyYWN0fSByZXR1cm5zIGNvbnRyYWN0IGlmIG5vIGNhbGxiYWNrIHdhcyBwYXNzZWQsXG4gKiBvdGhlcndpc2UgY2FsbHMgY2FsbGJhY2sgZnVuY3Rpb24gKGVyciwgY29udHJhY3QpXG4gKi9cbkNvbnRyYWN0RmFjdG9yeS5wcm90b3R5cGUuYXQgPSBmdW5jdGlvbiAoYWRkcmVzcywgY2FsbGJhY2spIHtcbiAgICAvLyBUT0RPOiBhZGRyZXNzIGlzIHJlcXVpcmVkXG4gICAgXG4gICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgIGNhbGxiYWNrKG51bGwsIG5ldyBDb250cmFjdCh0aGlzLmFiaSwgYWRkcmVzcykpO1xuICAgIH0gXG4gICAgcmV0dXJuIG5ldyBDb250cmFjdCh0aGlzLmFiaSwgYWRkcmVzcyk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gY3JlYXRlIG5ldyBjb250cmFjdCBpbnN0YW5jZVxuICpcbiAqIEBtZXRob2QgQ29udHJhY3RcbiAqIEBwYXJhbSB7QXJyYXl9IGFiaVxuICogQHBhcmFtIHtBZGRyZXNzfSBjb250cmFjdCBhZGRyZXNzXG4gKi9cbnZhciBDb250cmFjdCA9IGZ1bmN0aW9uIChhYmksIGFkZHJlc3MpIHtcbiAgICB0aGlzLmFkZHJlc3MgPSBhZGRyZXNzO1xuICAgIGFkZEZ1bmN0aW9uc1RvQ29udHJhY3QodGhpcywgYWJpKTtcbiAgICBhZGRFdmVudHNUb0NvbnRyYWN0KHRoaXMsIGFiaSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNvbnRyYWN0O1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBAZmlsZSBkYi5qc1xuICogQGF1dGhvcnM6XG4gKiAgIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciBNZXRob2QgPSByZXF1aXJlKCcuL21ldGhvZCcpO1xuXG52YXIgcHV0U3RyaW5nID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ3B1dFN0cmluZycsXG4gICAgY2FsbDogJ2RiX3B1dFN0cmluZycsXG4gICAgcGFyYW1zOiAzXG59KTtcblxuXG52YXIgZ2V0U3RyaW5nID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2dldFN0cmluZycsXG4gICAgY2FsbDogJ2RiX2dldFN0cmluZycsXG4gICAgcGFyYW1zOiAyXG59KTtcblxudmFyIHB1dEhleCA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdwdXRIZXgnLFxuICAgIGNhbGw6ICdkYl9wdXRIZXgnLFxuICAgIHBhcmFtczogM1xufSk7XG5cbnZhciBnZXRIZXggPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnZ2V0SGV4JyxcbiAgICBjYWxsOiAnZGJfZ2V0SGV4JyxcbiAgICBwYXJhbXM6IDJcbn0pO1xuXG52YXIgbWV0aG9kcyA9IFtcbiAgICBwdXRTdHJpbmcsIGdldFN0cmluZywgcHV0SGV4LCBnZXRIZXhcbl07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIG1ldGhvZHM6IG1ldGhvZHNcbn07XG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBcbiAqIEBmaWxlIGVycm9ycy5qc1xuICogQGF1dGhvciBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBJbnZhbGlkTnVtYmVyT2ZQYXJhbXM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBFcnJvcignSW52YWxpZCBudW1iZXIgb2YgaW5wdXQgcGFyYW1ldGVycycpO1xuICAgIH0sXG4gICAgSW52YWxpZENvbm5lY3Rpb246IGZ1bmN0aW9uIChob3N0KXtcbiAgICAgICAgcmV0dXJuIG5ldyBFcnJvcignQ09OTkVDVElPTiBFUlJPUjogQ291bGRuXFwndCBjb25uZWN0IHRvIG5vZGUgJysgaG9zdCArJywgaXMgaXQgcnVubmluZz8nKTtcbiAgICB9LFxuICAgIEludmFsaWRQcm92aWRlcjogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gbmV3IEVycm9yKCdQcm92aWRvciBub3Qgc2V0IG9yIGludmFsaWQnKTtcbiAgICB9LFxuICAgIEludmFsaWRSZXNwb25zZTogZnVuY3Rpb24gKHJlc3VsdCl7XG4gICAgICAgIHZhciBtZXNzYWdlID0gISFyZXN1bHQgJiYgISFyZXN1bHQuZXJyb3IgJiYgISFyZXN1bHQuZXJyb3IubWVzc2FnZSA/IHJlc3VsdC5lcnJvci5tZXNzYWdlIDogJ0ludmFsaWQgSlNPTiBSUEMgcmVzcG9uc2UnO1xuICAgICAgICByZXR1cm4gbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgIH1cbn07XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqXG4gKiBAZmlsZSBldGguanNcbiAqIEBhdXRob3IgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiBAYXV0aG9yIEZhYmlhbiBWb2dlbHN0ZWxsZXIgPGZhYmlhbkBldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbi8qKlxuICogV2ViM1xuICpcbiAqIEBtb2R1bGUgd2ViM1xuICovXG5cbi8qKlxuICogRXRoIG1ldGhvZHMgYW5kIHByb3BlcnRpZXNcbiAqXG4gKiBBbiBleGFtcGxlIG1ldGhvZCBvYmplY3QgY2FuIGxvb2sgYXMgZm9sbG93czpcbiAqXG4gKiAgICAgIHtcbiAqICAgICAgbmFtZTogJ2dldEJsb2NrJyxcbiAqICAgICAgY2FsbDogYmxvY2tDYWxsLFxuICogICAgICBwYXJhbXM6IDIsXG4gKiAgICAgIG91dHB1dEZvcm1hdHRlcjogZm9ybWF0dGVycy5vdXRwdXRCbG9ja0Zvcm1hdHRlcixcbiAqICAgICAgaW5wdXRGb3JtYXR0ZXI6IFsgLy8gY2FuIGJlIGEgZm9ybWF0dGVyIGZ1bmNpdG9uIG9yIGFuIGFycmF5IG9mIGZ1bmN0aW9ucy4gV2hlcmUgZWFjaCBpdGVtIGluIHRoZSBhcnJheSB3aWxsIGJlIHVzZWQgZm9yIG9uZSBwYXJhbWV0ZXJcbiAqICAgICAgICAgICB1dGlscy50b0hleCwgLy8gZm9ybWF0cyBwYXJhbXRlciAxXG4gKiAgICAgICAgICAgZnVuY3Rpb24ocGFyYW0peyByZXR1cm4gISFwYXJhbTsgfSAvLyBmb3JtYXRzIHBhcmFtdGVyIDJcbiAqICAgICAgICAgXVxuICogICAgICAgfSxcbiAqXG4gKiBAY2xhc3MgW3dlYjNdIGV0aFxuICogQGNvbnN0cnVjdG9yXG4gKi9cblxuXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciBmb3JtYXR0ZXJzID0gcmVxdWlyZSgnLi9mb3JtYXR0ZXJzJyk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xudmFyIE1ldGhvZCA9IHJlcXVpcmUoJy4vbWV0aG9kJyk7XG52YXIgUHJvcGVydHkgPSByZXF1aXJlKCcuL3Byb3BlcnR5Jyk7XG5cbnZhciBibG9ja0NhbGwgPSBmdW5jdGlvbiAoYXJncykge1xuICAgIHJldHVybiAodXRpbHMuaXNTdHJpbmcoYXJnc1swXSkgJiYgYXJnc1swXS5pbmRleE9mKCcweCcpID09PSAwKSA/IFwiZXRoX2dldEJsb2NrQnlIYXNoXCIgOiBcImV0aF9nZXRCbG9ja0J5TnVtYmVyXCI7XG59O1xuXG52YXIgdHJhbnNhY3Rpb25Gcm9tQmxvY2tDYWxsID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICByZXR1cm4gKHV0aWxzLmlzU3RyaW5nKGFyZ3NbMF0pICYmIGFyZ3NbMF0uaW5kZXhPZignMHgnKSA9PT0gMCkgPyAnZXRoX2dldFRyYW5zYWN0aW9uQnlCbG9ja0hhc2hBbmRJbmRleCcgOiAnZXRoX2dldFRyYW5zYWN0aW9uQnlCbG9ja051bWJlckFuZEluZGV4Jztcbn07XG5cbnZhciB1bmNsZUNhbGwgPSBmdW5jdGlvbiAoYXJncykge1xuICAgIHJldHVybiAodXRpbHMuaXNTdHJpbmcoYXJnc1swXSkgJiYgYXJnc1swXS5pbmRleE9mKCcweCcpID09PSAwKSA/ICdldGhfZ2V0VW5jbGVCeUJsb2NrSGFzaEFuZEluZGV4JyA6ICdldGhfZ2V0VW5jbGVCeUJsb2NrTnVtYmVyQW5kSW5kZXgnO1xufTtcblxudmFyIGdldEJsb2NrVHJhbnNhY3Rpb25Db3VudENhbGwgPSBmdW5jdGlvbiAoYXJncykge1xuICAgIHJldHVybiAodXRpbHMuaXNTdHJpbmcoYXJnc1swXSkgJiYgYXJnc1swXS5pbmRleE9mKCcweCcpID09PSAwKSA/ICdldGhfZ2V0QmxvY2tUcmFuc2FjdGlvbkNvdW50QnlIYXNoJyA6ICdldGhfZ2V0QmxvY2tUcmFuc2FjdGlvbkNvdW50QnlOdW1iZXInO1xufTtcblxudmFyIHVuY2xlQ291bnRDYWxsID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICByZXR1cm4gKHV0aWxzLmlzU3RyaW5nKGFyZ3NbMF0pICYmIGFyZ3NbMF0uaW5kZXhPZignMHgnKSA9PT0gMCkgPyAnZXRoX2dldFVuY2xlQ291bnRCeUJsb2NrSGFzaCcgOiAnZXRoX2dldFVuY2xlQ291bnRCeUJsb2NrTnVtYmVyJztcbn07XG5cbi8vLyBAcmV0dXJucyBhbiBhcnJheSBvZiBvYmplY3RzIGRlc2NyaWJpbmcgd2ViMy5ldGggYXBpIG1ldGhvZHNcblxudmFyIGdldEJhbGFuY2UgPSBuZXcgTWV0aG9kKHtcblx0bmFtZTogJ2dldEJhbGFuY2UnLFxuXHRjYWxsOiAnZXRoX2dldEJhbGFuY2UnLFxuXHRwYXJhbXM6IDIsXG5cdGlucHV0Rm9ybWF0dGVyOiBbdXRpbHMudG9BZGRyZXNzLCBmb3JtYXR0ZXJzLmlucHV0RGVmYXVsdEJsb2NrTnVtYmVyRm9ybWF0dGVyXSxcblx0b3V0cHV0Rm9ybWF0dGVyOiBmb3JtYXR0ZXJzLm91dHB1dEJpZ051bWJlckZvcm1hdHRlclxufSk7XG5cbnZhciBnZXRTdG9yYWdlQXQgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnZ2V0U3RvcmFnZUF0JyxcbiAgICBjYWxsOiAnZXRoX2dldFN0b3JhZ2VBdCcsXG4gICAgcGFyYW1zOiAzLFxuICAgIGlucHV0Rm9ybWF0dGVyOiBbbnVsbCwgdXRpbHMudG9IZXgsIGZvcm1hdHRlcnMuaW5wdXREZWZhdWx0QmxvY2tOdW1iZXJGb3JtYXR0ZXJdXG59KTtcblxudmFyIGdldENvZGUgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnZ2V0Q29kZScsXG4gICAgY2FsbDogJ2V0aF9nZXRDb2RlJyxcbiAgICBwYXJhbXM6IDIsXG4gICAgaW5wdXRGb3JtYXR0ZXI6IFt1dGlscy50b0FkZHJlc3MsIGZvcm1hdHRlcnMuaW5wdXREZWZhdWx0QmxvY2tOdW1iZXJGb3JtYXR0ZXJdXG59KTtcblxudmFyIGdldEJsb2NrID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2dldEJsb2NrJyxcbiAgICBjYWxsOiBibG9ja0NhbGwsXG4gICAgcGFyYW1zOiAyLFxuICAgIGlucHV0Rm9ybWF0dGVyOiBbZm9ybWF0dGVycy5pbnB1dEJsb2NrTnVtYmVyRm9ybWF0dGVyLCBmdW5jdGlvbiAodmFsKSB7IHJldHVybiAhIXZhbDsgfV0sXG4gICAgb3V0cHV0Rm9ybWF0dGVyOiBmb3JtYXR0ZXJzLm91dHB1dEJsb2NrRm9ybWF0dGVyXG59KTtcblxudmFyIGdldFVuY2xlID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2dldFVuY2xlJyxcbiAgICBjYWxsOiB1bmNsZUNhbGwsXG4gICAgcGFyYW1zOiAyLFxuICAgIGlucHV0Rm9ybWF0dGVyOiBbZm9ybWF0dGVycy5pbnB1dEJsb2NrTnVtYmVyRm9ybWF0dGVyLCB1dGlscy50b0hleF0sXG4gICAgb3V0cHV0Rm9ybWF0dGVyOiBmb3JtYXR0ZXJzLm91dHB1dEJsb2NrRm9ybWF0dGVyLFxuXG59KTtcblxudmFyIGdldENvbXBpbGVycyA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdnZXRDb21waWxlcnMnLFxuICAgIGNhbGw6ICdldGhfZ2V0Q29tcGlsZXJzJyxcbiAgICBwYXJhbXM6IDBcbn0pO1xuXG52YXIgZ2V0QmxvY2tUcmFuc2FjdGlvbkNvdW50ID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2dldEJsb2NrVHJhbnNhY3Rpb25Db3VudCcsXG4gICAgY2FsbDogZ2V0QmxvY2tUcmFuc2FjdGlvbkNvdW50Q2FsbCxcbiAgICBwYXJhbXM6IDEsXG4gICAgaW5wdXRGb3JtYXR0ZXI6IFtmb3JtYXR0ZXJzLmlucHV0QmxvY2tOdW1iZXJGb3JtYXR0ZXJdLFxuICAgIG91dHB1dEZvcm1hdHRlcjogdXRpbHMudG9EZWNpbWFsXG59KTtcblxudmFyIGdldEJsb2NrVW5jbGVDb3VudCA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdnZXRCbG9ja1VuY2xlQ291bnQnLFxuICAgIGNhbGw6IHVuY2xlQ291bnRDYWxsLFxuICAgIHBhcmFtczogMSxcbiAgICBpbnB1dEZvcm1hdHRlcjogW2Zvcm1hdHRlcnMuaW5wdXRCbG9ja051bWJlckZvcm1hdHRlcl0sXG4gICAgb3V0cHV0Rm9ybWF0dGVyOiB1dGlscy50b0RlY2ltYWxcbn0pO1xuXG52YXIgZ2V0VHJhbnNhY3Rpb24gPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnZ2V0VHJhbnNhY3Rpb24nLFxuICAgIGNhbGw6ICdldGhfZ2V0VHJhbnNhY3Rpb25CeUhhc2gnLFxuICAgIHBhcmFtczogMSxcbiAgICBvdXRwdXRGb3JtYXR0ZXI6IGZvcm1hdHRlcnMub3V0cHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXJcbn0pO1xuXG52YXIgZ2V0VHJhbnNhY3Rpb25Gcm9tQmxvY2sgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnZ2V0VHJhbnNhY3Rpb25Gcm9tQmxvY2snLFxuICAgIGNhbGw6IHRyYW5zYWN0aW9uRnJvbUJsb2NrQ2FsbCxcbiAgICBwYXJhbXM6IDIsXG4gICAgaW5wdXRGb3JtYXR0ZXI6IFtmb3JtYXR0ZXJzLmlucHV0QmxvY2tOdW1iZXJGb3JtYXR0ZXIsIHV0aWxzLnRvSGV4XSxcbiAgICBvdXRwdXRGb3JtYXR0ZXI6IGZvcm1hdHRlcnMub3V0cHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXJcbn0pO1xuXG52YXIgZ2V0VHJhbnNhY3Rpb25Db3VudCA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdnZXRUcmFuc2FjdGlvbkNvdW50JyxcbiAgICBjYWxsOiAnZXRoX2dldFRyYW5zYWN0aW9uQ291bnQnLFxuICAgIHBhcmFtczogMixcbiAgICBpbnB1dEZvcm1hdHRlcjogW251bGwsIGZvcm1hdHRlcnMuaW5wdXREZWZhdWx0QmxvY2tOdW1iZXJGb3JtYXR0ZXJdLFxuICAgIG91dHB1dEZvcm1hdHRlcjogdXRpbHMudG9EZWNpbWFsXG59KTtcblxudmFyIHNlbmRUcmFuc2FjdGlvbiA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdzZW5kVHJhbnNhY3Rpb24nLFxuICAgIGNhbGw6ICdldGhfc2VuZFRyYW5zYWN0aW9uJyxcbiAgICBwYXJhbXM6IDEsXG4gICAgaW5wdXRGb3JtYXR0ZXI6IFtmb3JtYXR0ZXJzLmlucHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXJdXG59KTtcblxudmFyIGNhbGwgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnY2FsbCcsXG4gICAgY2FsbDogJ2V0aF9jYWxsJyxcbiAgICBwYXJhbXM6IDIsXG4gICAgaW5wdXRGb3JtYXR0ZXI6IFtmb3JtYXR0ZXJzLmlucHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXIsIGZvcm1hdHRlcnMuaW5wdXREZWZhdWx0QmxvY2tOdW1iZXJGb3JtYXR0ZXJdXG59KTtcblxudmFyIGVzdGltYXRlR2FzID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2VzdGltYXRlR2FzJyxcbiAgICBjYWxsOiAnZXRoX2VzdGltYXRlR2FzJyxcbiAgICBwYXJhbXM6IDEsXG4gICAgaW5wdXRGb3JtYXR0ZXI6IFtmb3JtYXR0ZXJzLmlucHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXJdLFxuICAgIG91dHB1dEZvcm1hdHRlcjogdXRpbHMudG9EZWNpbWFsXG59KTtcblxudmFyIGNvbXBpbGVTb2xpZGl0eSA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdjb21waWxlLnNvbGlkaXR5JyxcbiAgICBjYWxsOiAnZXRoX2NvbXBpbGVTb2xpZGl0eScsXG4gICAgcGFyYW1zOiAxXG59KTtcblxudmFyIGNvbXBpbGVMTEwgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnY29tcGlsZS5sbGwnLFxuICAgIGNhbGw6ICdldGhfY29tcGlsZUxMTCcsXG4gICAgcGFyYW1zOiAxXG59KTtcblxudmFyIGNvbXBpbGVTZXJwZW50ID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2NvbXBpbGUuc2VycGVudCcsXG4gICAgY2FsbDogJ2V0aF9jb21waWxlU2VycGVudCcsXG4gICAgcGFyYW1zOiAxXG59KTtcblxudmFyIHN1Ym1pdFdvcmsgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnc3VibWl0V29yaycsXG4gICAgY2FsbDogJ2V0aF9zdWJtaXRXb3JrJyxcbiAgICBwYXJhbXM6IDNcbn0pO1xuXG52YXIgZ2V0V29yayA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICdnZXRXb3JrJyxcbiAgICBjYWxsOiAnZXRoX2dldFdvcmsnLFxuICAgIHBhcmFtczogMFxufSk7XG5cbnZhciBtZXRob2RzID0gW1xuICAgIGdldEJhbGFuY2UsXG4gICAgZ2V0U3RvcmFnZUF0LFxuICAgIGdldENvZGUsXG4gICAgZ2V0QmxvY2ssXG4gICAgZ2V0VW5jbGUsXG4gICAgZ2V0Q29tcGlsZXJzLFxuICAgIGdldEJsb2NrVHJhbnNhY3Rpb25Db3VudCxcbiAgICBnZXRCbG9ja1VuY2xlQ291bnQsXG4gICAgZ2V0VHJhbnNhY3Rpb24sXG4gICAgZ2V0VHJhbnNhY3Rpb25Gcm9tQmxvY2ssXG4gICAgZ2V0VHJhbnNhY3Rpb25Db3VudCxcbiAgICBjYWxsLFxuICAgIGVzdGltYXRlR2FzLFxuICAgIHNlbmRUcmFuc2FjdGlvbixcbiAgICBjb21waWxlU29saWRpdHksXG4gICAgY29tcGlsZUxMTCxcbiAgICBjb21waWxlU2VycGVudCxcbiAgICBzdWJtaXRXb3JrLFxuICAgIGdldFdvcmtcbl07XG5cbi8vLyBAcmV0dXJucyBhbiBhcnJheSBvZiBvYmplY3RzIGRlc2NyaWJpbmcgd2ViMy5ldGggYXBpIHByb3BlcnRpZXNcblxuXG5cbnZhciBwcm9wZXJ0aWVzID0gW1xuICAgIG5ldyBQcm9wZXJ0eSh7XG4gICAgICAgIG5hbWU6ICdjb2luYmFzZScsXG4gICAgICAgIGdldHRlcjogJ2V0aF9jb2luYmFzZSdcbiAgICB9KSxcbiAgICBuZXcgUHJvcGVydHkoe1xuICAgICAgICBuYW1lOiAnbWluaW5nJyxcbiAgICAgICAgZ2V0dGVyOiAnZXRoX21pbmluZydcbiAgICB9KSxcbiAgICBuZXcgUHJvcGVydHkoe1xuICAgICAgICBuYW1lOiAnaGFzaHJhdGUnLFxuICAgICAgICBnZXR0ZXI6ICdldGhfaGFzaHJhdGUnLFxuICAgICAgICBvdXRwdXRGb3JtYXR0ZXI6IHV0aWxzLnRvRGVjaW1hbFxuICAgIH0pLFxuICAgIG5ldyBQcm9wZXJ0eSh7XG4gICAgICAgIG5hbWU6ICdnYXNQcmljZScsXG4gICAgICAgIGdldHRlcjogJ2V0aF9nYXNQcmljZScsXG4gICAgICAgIG91dHB1dEZvcm1hdHRlcjogZm9ybWF0dGVycy5vdXRwdXRCaWdOdW1iZXJGb3JtYXR0ZXJcbiAgICB9KSxcbiAgICBuZXcgUHJvcGVydHkoe1xuICAgICAgICBuYW1lOiAnYWNjb3VudHMnLFxuICAgICAgICBnZXR0ZXI6ICdldGhfYWNjb3VudHMnXG4gICAgfSksXG4gICAgbmV3IFByb3BlcnR5KHtcbiAgICAgICAgbmFtZTogJ2Jsb2NrTnVtYmVyJyxcbiAgICAgICAgZ2V0dGVyOiAnZXRoX2Jsb2NrTnVtYmVyJyxcbiAgICAgICAgb3V0cHV0Rm9ybWF0dGVyOiB1dGlscy50b0RlY2ltYWxcbiAgICB9KVxuXTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgbWV0aG9kczogbWV0aG9kcyxcbiAgICBwcm9wZXJ0aWVzOiBwcm9wZXJ0aWVzXG59O1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBcbiAqIEBmaWxlIGV2ZW50LmpzXG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNFxuICovXG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG52YXIgY29kZXIgPSByZXF1aXJlKCcuLi9zb2xpZGl0eS9jb2RlcicpO1xudmFyIHdlYjMgPSByZXF1aXJlKCcuLi93ZWIzJyk7XG52YXIgZm9ybWF0dGVycyA9IHJlcXVpcmUoJy4vZm9ybWF0dGVycycpO1xudmFyIHNoYTMgPSByZXF1aXJlKCcuLi91dGlscy9zaGEzJyk7XG5cbi8qKlxuICogVGhpcyBwcm90b3R5cGUgc2hvdWxkIGJlIHVzZWQgdG8gY3JlYXRlIGV2ZW50IGZpbHRlcnNcbiAqL1xudmFyIFNvbGlkaXR5RXZlbnQgPSBmdW5jdGlvbiAoanNvbiwgYWRkcmVzcykge1xuICAgIHRoaXMuX3BhcmFtcyA9IGpzb24uaW5wdXRzO1xuICAgIHRoaXMuX25hbWUgPSB1dGlscy50cmFuc2Zvcm1Ub0Z1bGxOYW1lKGpzb24pO1xuICAgIHRoaXMuX2FkZHJlc3MgPSBhZGRyZXNzO1xuICAgIHRoaXMuX2Fub255bW91cyA9IGpzb24uYW5vbnltb3VzO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBnZXQgZmlsdGVyZWQgcGFyYW0gdHlwZXNcbiAqXG4gKiBAbWV0aG9kIHR5cGVzXG4gKiBAcGFyYW0ge0Jvb2x9IGRlY2lkZSBpZiByZXR1cm5lZCB0eXBlZCBzaG91bGQgYmUgaW5kZXhlZFxuICogQHJldHVybiB7QXJyYXl9IGFycmF5IG9mIHR5cGVzXG4gKi9cblNvbGlkaXR5RXZlbnQucHJvdG90eXBlLnR5cGVzID0gZnVuY3Rpb24gKGluZGV4ZWQpIHtcbiAgICByZXR1cm4gdGhpcy5fcGFyYW1zLmZpbHRlcihmdW5jdGlvbiAoaSkge1xuICAgICAgICByZXR1cm4gaS5pbmRleGVkID09PSBpbmRleGVkO1xuICAgIH0pLm1hcChmdW5jdGlvbiAoaSkge1xuICAgICAgICByZXR1cm4gaS50eXBlO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBnZXQgZXZlbnQgZGlzcGxheSBuYW1lXG4gKlxuICogQG1ldGhvZCBkaXNwbGF5TmFtZVxuICogQHJldHVybiB7U3RyaW5nfSBldmVudCBkaXNwbGF5IG5hbWVcbiAqL1xuU29saWRpdHlFdmVudC5wcm90b3R5cGUuZGlzcGxheU5hbWUgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHV0aWxzLmV4dHJhY3REaXNwbGF5TmFtZSh0aGlzLl9uYW1lKTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZ2V0IGV2ZW50IHR5cGUgbmFtZVxuICpcbiAqIEBtZXRob2QgdHlwZU5hbWVcbiAqIEByZXR1cm4ge1N0cmluZ30gZXZlbnQgdHlwZSBuYW1lXG4gKi9cblNvbGlkaXR5RXZlbnQucHJvdG90eXBlLnR5cGVOYW1lID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB1dGlscy5leHRyYWN0VHlwZU5hbWUodGhpcy5fbmFtZSk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGdldCBldmVudCBzaWduYXR1cmVcbiAqXG4gKiBAbWV0aG9kIHNpZ25hdHVyZVxuICogQHJldHVybiB7U3RyaW5nfSBldmVudCBzaWduYXR1cmVcbiAqL1xuU29saWRpdHlFdmVudC5wcm90b3R5cGUuc2lnbmF0dXJlID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiBzaGEzKHRoaXMuX25hbWUpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBlbmNvZGUgaW5kZXhlZCBwYXJhbXMgYW5kIG9wdGlvbnMgdG8gb25lIGZpbmFsIG9iamVjdFxuICogXG4gKiBAbWV0aG9kIGVuY29kZVxuICogQHBhcmFtIHtPYmplY3R9IGluZGV4ZWRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtPYmplY3R9IGV2ZXJ5dGhpbmcgY29tYmluZWQgdG9nZXRoZXIgYW5kIGVuY29kZWRcbiAqL1xuU29saWRpdHlFdmVudC5wcm90b3R5cGUuZW5jb2RlID0gZnVuY3Rpb24gKGluZGV4ZWQsIG9wdGlvbnMpIHtcbiAgICBpbmRleGVkID0gaW5kZXhlZCB8fCB7fTtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICB2YXIgcmVzdWx0ID0ge307XG5cbiAgICBbJ2Zyb21CbG9jaycsICd0b0Jsb2NrJ10uZmlsdGVyKGZ1bmN0aW9uIChmKSB7XG4gICAgICAgIHJldHVybiBvcHRpb25zW2ZdICE9PSB1bmRlZmluZWQ7XG4gICAgfSkuZm9yRWFjaChmdW5jdGlvbiAoZikge1xuICAgICAgICByZXN1bHRbZl0gPSBmb3JtYXR0ZXJzLmlucHV0QmxvY2tOdW1iZXJGb3JtYXR0ZXIob3B0aW9uc1tmXSk7XG4gICAgfSk7XG5cbiAgICByZXN1bHQudG9waWNzID0gW107XG5cbiAgICBpZiAoIXRoaXMuX2Fub255bW91cykge1xuICAgICAgICByZXN1bHQuYWRkcmVzcyA9IHRoaXMuX2FkZHJlc3M7XG4gICAgICAgIHJlc3VsdC50b3BpY3MucHVzaCgnMHgnICsgdGhpcy5zaWduYXR1cmUoKSk7XG4gICAgfVxuXG4gICAgdmFyIGluZGV4ZWRUb3BpY3MgPSB0aGlzLl9wYXJhbXMuZmlsdGVyKGZ1bmN0aW9uIChpKSB7XG4gICAgICAgIHJldHVybiBpLmluZGV4ZWQgPT09IHRydWU7XG4gICAgfSkubWFwKGZ1bmN0aW9uIChpKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IGluZGV4ZWRbaS5uYW1lXTtcbiAgICAgICAgaWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZiAodXRpbHMuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZS5tYXAoZnVuY3Rpb24gKHYpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gJzB4JyArIGNvZGVyLmVuY29kZVBhcmFtKGkudHlwZSwgdik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gJzB4JyArIGNvZGVyLmVuY29kZVBhcmFtKGkudHlwZSwgdmFsdWUpO1xuICAgIH0pO1xuXG4gICAgcmVzdWx0LnRvcGljcyA9IHJlc3VsdC50b3BpY3MuY29uY2F0KGluZGV4ZWRUb3BpY3MpO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZGVjb2RlIGluZGV4ZWQgcGFyYW1zIGFuZCBvcHRpb25zXG4gKlxuICogQG1ldGhvZCBkZWNvZGVcbiAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhXG4gKiBAcmV0dXJuIHtPYmplY3R9IHJlc3VsdCBvYmplY3Qgd2l0aCBkZWNvZGVkIGluZGV4ZWQgJiYgbm90IGluZGV4ZWQgcGFyYW1zXG4gKi9cblNvbGlkaXR5RXZlbnQucHJvdG90eXBlLmRlY29kZSA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gXG4gICAgZGF0YS5kYXRhID0gZGF0YS5kYXRhIHx8ICcnO1xuICAgIGRhdGEudG9waWNzID0gZGF0YS50b3BpY3MgfHwgW107XG5cbiAgICB2YXIgYXJnVG9waWNzID0gdGhpcy5fYW5vbnltb3VzID8gZGF0YS50b3BpY3MgOiBkYXRhLnRvcGljcy5zbGljZSgxKTtcbiAgICB2YXIgaW5kZXhlZERhdGEgPSBhcmdUb3BpY3MubWFwKGZ1bmN0aW9uICh0b3BpY3MpIHsgcmV0dXJuIHRvcGljcy5zbGljZSgyKTsgfSkuam9pbihcIlwiKTtcbiAgICB2YXIgaW5kZXhlZFBhcmFtcyA9IGNvZGVyLmRlY29kZVBhcmFtcyh0aGlzLnR5cGVzKHRydWUpLCBpbmRleGVkRGF0YSk7IFxuXG4gICAgdmFyIG5vdEluZGV4ZWREYXRhID0gZGF0YS5kYXRhLnNsaWNlKDIpO1xuICAgIHZhciBub3RJbmRleGVkUGFyYW1zID0gY29kZXIuZGVjb2RlUGFyYW1zKHRoaXMudHlwZXMoZmFsc2UpLCBub3RJbmRleGVkRGF0YSk7XG4gICAgXG4gICAgdmFyIHJlc3VsdCA9IGZvcm1hdHRlcnMub3V0cHV0TG9nRm9ybWF0dGVyKGRhdGEpO1xuICAgIHJlc3VsdC5ldmVudCA9IHRoaXMuZGlzcGxheU5hbWUoKTtcbiAgICByZXN1bHQuYWRkcmVzcyA9IGRhdGEuYWRkcmVzcztcblxuICAgIHJlc3VsdC5hcmdzID0gdGhpcy5fcGFyYW1zLnJlZHVjZShmdW5jdGlvbiAoYWNjLCBjdXJyZW50KSB7XG4gICAgICAgIGFjY1tjdXJyZW50Lm5hbWVdID0gY3VycmVudC5pbmRleGVkID8gaW5kZXhlZFBhcmFtcy5zaGlmdCgpIDogbm90SW5kZXhlZFBhcmFtcy5zaGlmdCgpO1xuICAgICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcblxuICAgIGRlbGV0ZSByZXN1bHQuZGF0YTtcbiAgICBkZWxldGUgcmVzdWx0LnRvcGljcztcblxuICAgIHJldHVybiByZXN1bHQ7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGNyZWF0ZSBuZXcgZmlsdGVyIG9iamVjdCBmcm9tIGV2ZW50XG4gKlxuICogQG1ldGhvZCBleGVjdXRlXG4gKiBAcGFyYW0ge09iamVjdH0gaW5kZXhlZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge09iamVjdH0gZmlsdGVyIG9iamVjdFxuICovXG5Tb2xpZGl0eUV2ZW50LnByb3RvdHlwZS5leGVjdXRlID0gZnVuY3Rpb24gKGluZGV4ZWQsIG9wdGlvbnMpIHtcbiAgICB2YXIgbyA9IHRoaXMuZW5jb2RlKGluZGV4ZWQsIG9wdGlvbnMpO1xuICAgIHZhciBmb3JtYXR0ZXIgPSB0aGlzLmRlY29kZS5iaW5kKHRoaXMpO1xuICAgIHJldHVybiB3ZWIzLmV0aC5maWx0ZXIobywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZvcm1hdHRlcik7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGF0dGFjaCBldmVudCB0byBjb250cmFjdCBvYmplY3RcbiAqXG4gKiBAbWV0aG9kIGF0dGFjaFRvQ29udHJhY3RcbiAqIEBwYXJhbSB7Q29udHJhY3R9XG4gKi9cblNvbGlkaXR5RXZlbnQucHJvdG90eXBlLmF0dGFjaFRvQ29udHJhY3QgPSBmdW5jdGlvbiAoY29udHJhY3QpIHtcbiAgICB2YXIgZXhlY3V0ZSA9IHRoaXMuZXhlY3V0ZS5iaW5kKHRoaXMpO1xuICAgIHZhciBkaXNwbGF5TmFtZSA9IHRoaXMuZGlzcGxheU5hbWUoKTtcbiAgICBpZiAoIWNvbnRyYWN0W2Rpc3BsYXlOYW1lXSkge1xuICAgICAgICBjb250cmFjdFtkaXNwbGF5TmFtZV0gPSBleGVjdXRlO1xuICAgIH1cbiAgICBjb250cmFjdFtkaXNwbGF5TmFtZV1bdGhpcy50eXBlTmFtZSgpXSA9IHRoaXMuZXhlY3V0ZS5iaW5kKHRoaXMsIGNvbnRyYWN0KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU29saWRpdHlFdmVudDtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogQGZpbGUgZmlsdGVyLmpzXG4gKiBAYXV0aG9yczpcbiAqICAgSmVmZnJleSBXaWxja2UgPGplZmZAZXRoZGV2LmNvbT5cbiAqICAgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiAgIE1hcmlhbiBPYW5jZWEgPG1hcmlhbkBldGhkZXYuY29tPlxuICogICBGYWJpYW4gVm9nZWxzdGVsbGVyIDxmYWJpYW5AZXRoZGV2LmNvbT5cbiAqICAgR2F2IFdvb2QgPGdAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTRcbiAqL1xuXG52YXIgUmVxdWVzdE1hbmFnZXIgPSByZXF1aXJlKCcuL3JlcXVlc3RtYW5hZ2VyJyk7XG52YXIgZm9ybWF0dGVycyA9IHJlcXVpcmUoJy4vZm9ybWF0dGVycycpO1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcblxuLyoqXG4qIENvbnZlcnRzIGEgZ2l2ZW4gdG9waWMgdG8gYSBoZXggc3RyaW5nLCBidXQgYWxzbyBhbGxvd3MgbnVsbCB2YWx1ZXMuXG4qXG4qIEBwYXJhbSB7TWl4ZWR9IHZhbHVlXG4qIEByZXR1cm4ge1N0cmluZ31cbiovXG52YXIgdG9Ub3BpYyA9IGZ1bmN0aW9uKHZhbHVlKXtcblxuICAgIGlmKHZhbHVlID09PSBudWxsIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpXG4gICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgdmFsdWUgPSBTdHJpbmcodmFsdWUpO1xuXG4gICAgaWYodmFsdWUuaW5kZXhPZignMHgnKSA9PT0gMClcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIGVsc2VcbiAgICAgICAgcmV0dXJuIHV0aWxzLmZyb21Bc2NpaSh2YWx1ZSk7XG59O1xuXG4vLy8gVGhpcyBtZXRob2Qgc2hvdWxkIGJlIGNhbGxlZCBvbiBvcHRpb25zIG9iamVjdCwgdG8gdmVyaWZ5IGRlcHJlY2F0ZWQgcHJvcGVydGllcyAmJiBsYXp5IGxvYWQgZHluYW1pYyBvbmVzXG4vLy8gQHBhcmFtIHNob3VsZCBiZSBzdHJpbmcgb3Igb2JqZWN0XG4vLy8gQHJldHVybnMgb3B0aW9ucyBzdHJpbmcgb3Igb2JqZWN0XG52YXIgZ2V0T3B0aW9ucyA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cbiAgICBpZiAodXRpbHMuaXNTdHJpbmcob3B0aW9ucykpIHtcbiAgICAgICAgcmV0dXJuIG9wdGlvbnM7XG4gICAgfSBcblxuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgLy8gbWFrZSBzdXJlIHRvcGljcywgZ2V0IGNvbnZlcnRlZCB0byBoZXhcbiAgICBvcHRpb25zLnRvcGljcyA9IG9wdGlvbnMudG9waWNzIHx8IFtdO1xuICAgIG9wdGlvbnMudG9waWNzID0gb3B0aW9ucy50b3BpY3MubWFwKGZ1bmN0aW9uKHRvcGljKXtcbiAgICAgICAgcmV0dXJuICh1dGlscy5pc0FycmF5KHRvcGljKSkgPyB0b3BpYy5tYXAodG9Ub3BpYykgOiB0b1RvcGljKHRvcGljKTtcbiAgICB9KTtcblxuICAgIC8vIGxhenkgbG9hZFxuICAgIHJldHVybiB7XG4gICAgICAgIHRvcGljczogb3B0aW9ucy50b3BpY3MsXG4gICAgICAgIHRvOiBvcHRpb25zLnRvLFxuICAgICAgICBhZGRyZXNzOiBvcHRpb25zLmFkZHJlc3MsXG4gICAgICAgIGZyb21CbG9jazogZm9ybWF0dGVycy5pbnB1dEJsb2NrTnVtYmVyRm9ybWF0dGVyKG9wdGlvbnMuZnJvbUJsb2NrKSxcbiAgICAgICAgdG9CbG9jazogZm9ybWF0dGVycy5pbnB1dEJsb2NrTnVtYmVyRm9ybWF0dGVyKG9wdGlvbnMudG9CbG9jaykgXG4gICAgfTsgXG59O1xuXG52YXIgRmlsdGVyID0gZnVuY3Rpb24gKG9wdGlvbnMsIG1ldGhvZHMsIGZvcm1hdHRlcikge1xuICAgIHZhciBpbXBsZW1lbnRhdGlvbiA9IHt9O1xuICAgIG1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbiAobWV0aG9kKSB7XG4gICAgICAgIG1ldGhvZC5hdHRhY2hUb09iamVjdChpbXBsZW1lbnRhdGlvbik7XG4gICAgfSk7XG4gICAgdGhpcy5vcHRpb25zID0gZ2V0T3B0aW9ucyhvcHRpb25zKTtcbiAgICB0aGlzLmltcGxlbWVudGF0aW9uID0gaW1wbGVtZW50YXRpb247XG4gICAgdGhpcy5jYWxsYmFja3MgPSBbXTtcbiAgICB0aGlzLmZvcm1hdHRlciA9IGZvcm1hdHRlcjtcbiAgICB0aGlzLmZpbHRlcklkID0gdGhpcy5pbXBsZW1lbnRhdGlvbi5uZXdGaWx0ZXIodGhpcy5vcHRpb25zKTtcbn07XG5cbkZpbHRlci5wcm90b3R5cGUud2F0Y2ggPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICB0aGlzLmNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB2YXIgb25NZXNzYWdlID0gZnVuY3Rpb24gKGVycm9yLCBtZXNzYWdlcykge1xuICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybiBzZWxmLmNhbGxiYWNrcy5mb3JFYWNoKGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycm9yKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgbWVzc2FnZXMuZm9yRWFjaChmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgICAgbWVzc2FnZSA9IHNlbGYuZm9ybWF0dGVyID8gc2VsZi5mb3JtYXR0ZXIobWVzc2FnZSkgOiBtZXNzYWdlO1xuICAgICAgICAgICAgc2VsZi5jYWxsYmFja3MuZm9yRWFjaChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCBtZXNzYWdlKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAgLy8gY2FsbCBnZXRGaWx0ZXJMb2dzIG9uIHN0YXJ0XG4gICAgaWYgKCF1dGlscy5pc1N0cmluZyh0aGlzLm9wdGlvbnMpKSB7XG4gICAgICAgIHRoaXMuZ2V0KGZ1bmN0aW9uIChlcnIsIG1lc3NhZ2VzKSB7XG4gICAgICAgICAgICAvLyBkb24ndCBzZW5kIGFsbCB0aGUgcmVzcG9uc2VzIHRvIGFsbCB0aGUgd2F0Y2hlcyBhZ2Fpbi4uLiBqdXN0IHRvIHRoaXMgb25lXG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbWVzc2FnZXMuZm9yRWFjaChmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIG1lc3NhZ2UpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIFJlcXVlc3RNYW5hZ2VyLmdldEluc3RhbmNlKCkuc3RhcnRQb2xsaW5nKHtcbiAgICAgICAgbWV0aG9kOiB0aGlzLmltcGxlbWVudGF0aW9uLnBvbGwuY2FsbCxcbiAgICAgICAgcGFyYW1zOiBbdGhpcy5maWx0ZXJJZF0sXG4gICAgfSwgdGhpcy5maWx0ZXJJZCwgb25NZXNzYWdlLCB0aGlzLnN0b3BXYXRjaGluZy5iaW5kKHRoaXMpKTtcbn07XG5cbkZpbHRlci5wcm90b3R5cGUuc3RvcFdhdGNoaW5nID0gZnVuY3Rpb24gKCkge1xuICAgIFJlcXVlc3RNYW5hZ2VyLmdldEluc3RhbmNlKCkuc3RvcFBvbGxpbmcodGhpcy5maWx0ZXJJZCk7XG4gICAgdGhpcy5pbXBsZW1lbnRhdGlvbi51bmluc3RhbGxGaWx0ZXIodGhpcy5maWx0ZXJJZCk7XG4gICAgdGhpcy5jYWxsYmFja3MgPSBbXTtcbn07XG5cbkZpbHRlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICh1dGlscy5pc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgICAgICB0aGlzLmltcGxlbWVudGF0aW9uLmdldExvZ3ModGhpcy5maWx0ZXJJZCwgZnVuY3Rpb24oZXJyLCByZXMpe1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHJlcy5tYXAoZnVuY3Rpb24gKGxvZykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc2VsZi5mb3JtYXR0ZXIgPyBzZWxmLmZvcm1hdHRlcihsb2cpIDogbG9nO1xuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIGxvZ3MgPSB0aGlzLmltcGxlbWVudGF0aW9uLmdldExvZ3ModGhpcy5maWx0ZXJJZCk7XG4gICAgICAgIHJldHVybiBsb2dzLm1hcChmdW5jdGlvbiAobG9nKSB7XG4gICAgICAgICAgICByZXR1cm4gc2VsZi5mb3JtYXR0ZXIgPyBzZWxmLmZvcm1hdHRlcihsb2cpIDogbG9nO1xuICAgICAgICB9KTtcbiAgICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZpbHRlcjtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogXG4gKiBAZmlsZSBmb3JtYXR0ZXJzLmpzXG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGF1dGhvciBGYWJpYW4gVm9nZWxzdGVsbGVyIDxmYWJpYW5AZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xudmFyIGNvbmZpZyA9IHJlcXVpcmUoJy4uL3V0aWxzL2NvbmZpZycpO1xuXG4vKipcbiAqIFNob3VsZCB0aGUgZm9ybWF0IG91dHB1dCB0byBhIGJpZyBudW1iZXJcbiAqXG4gKiBAbWV0aG9kIG91dHB1dEJpZ051bWJlckZvcm1hdHRlclxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfEJpZ051bWJlcn1cbiAqIEByZXR1cm5zIHtCaWdOdW1iZXJ9IG9iamVjdFxuICovXG52YXIgb3V0cHV0QmlnTnVtYmVyRm9ybWF0dGVyID0gZnVuY3Rpb24gKG51bWJlcikge1xuICAgIHJldHVybiB1dGlscy50b0JpZ051bWJlcihudW1iZXIpO1xufTtcblxudmFyIGlzUHJlZGVmaW5lZEJsb2NrTnVtYmVyID0gZnVuY3Rpb24gKGJsb2NrTnVtYmVyKSB7XG4gICAgcmV0dXJuIGJsb2NrTnVtYmVyID09PSAnbGF0ZXN0JyB8fCBibG9ja051bWJlciA9PT0gJ3BlbmRpbmcnIHx8IGJsb2NrTnVtYmVyID09PSAnZWFybGllc3QnO1xufTtcblxudmFyIGlucHV0RGVmYXVsdEJsb2NrTnVtYmVyRm9ybWF0dGVyID0gZnVuY3Rpb24gKGJsb2NrTnVtYmVyKSB7XG4gICAgaWYgKGJsb2NrTnVtYmVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIGNvbmZpZy5kZWZhdWx0QmxvY2s7XG4gICAgfVxuICAgIHJldHVybiBpbnB1dEJsb2NrTnVtYmVyRm9ybWF0dGVyKGJsb2NrTnVtYmVyKTtcbn07XG5cbnZhciBpbnB1dEJsb2NrTnVtYmVyRm9ybWF0dGVyID0gZnVuY3Rpb24gKGJsb2NrTnVtYmVyKSB7XG4gICAgaWYgKGJsb2NrTnVtYmVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9IGVsc2UgaWYgKGlzUHJlZGVmaW5lZEJsb2NrTnVtYmVyKGJsb2NrTnVtYmVyKSkge1xuICAgICAgICByZXR1cm4gYmxvY2tOdW1iZXI7XG4gICAgfVxuICAgIHJldHVybiB1dGlscy50b0hleChibG9ja051bWJlcik7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgdGhlIGlucHV0IG9mIGEgdHJhbnNhY3Rpb24gYW5kIGNvbnZlcnRzIGFsbCB2YWx1ZXMgdG8gSEVYXG4gKlxuICogQG1ldGhvZCBpbnB1dFRyYW5zYWN0aW9uRm9ybWF0dGVyXG4gKiBAcGFyYW0ge09iamVjdH0gdHJhbnNhY3Rpb24gb3B0aW9uc1xuICogQHJldHVybnMgb2JqZWN0XG4qL1xudmFyIGlucHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXIgPSBmdW5jdGlvbiAob3B0aW9ucyl7XG5cbiAgICBvcHRpb25zLmZyb20gPSBvcHRpb25zLmZyb20gfHwgY29uZmlnLmRlZmF1bHRBY2NvdW50O1xuXG4gICAgLy8gbWFrZSBjb2RlIC0+IGRhdGFcbiAgICBpZiAob3B0aW9ucy5jb2RlKSB7XG4gICAgICAgIG9wdGlvbnMuZGF0YSA9IG9wdGlvbnMuY29kZTtcbiAgICAgICAgZGVsZXRlIG9wdGlvbnMuY29kZTtcbiAgICB9XG5cbiAgICBbJ2dhc1ByaWNlJywgJ2dhcycsICd2YWx1ZScsICdub25jZSddLmZpbHRlcihmdW5jdGlvbiAoa2V5KSB7XG4gICAgICAgIHJldHVybiBvcHRpb25zW2tleV0gIT09IHVuZGVmaW5lZDtcbiAgICB9KS5mb3JFYWNoKGZ1bmN0aW9uKGtleSl7XG4gICAgICAgIG9wdGlvbnNba2V5XSA9IHV0aWxzLmZyb21EZWNpbWFsKG9wdGlvbnNba2V5XSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gb3B0aW9uczsgXG59O1xuXG4vKipcbiAqIEZvcm1hdHMgdGhlIG91dHB1dCBvZiBhIHRyYW5zYWN0aW9uIHRvIGl0cyBwcm9wZXIgdmFsdWVzXG4gKiBcbiAqIEBtZXRob2Qgb3V0cHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXJcbiAqIEBwYXJhbSB7T2JqZWN0fSB0cmFuc2FjdGlvblxuICogQHJldHVybnMge09iamVjdH0gdHJhbnNhY3Rpb25cbiovXG52YXIgb3V0cHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXIgPSBmdW5jdGlvbiAodHgpe1xuICAgIHR4LmJsb2NrTnVtYmVyID0gdXRpbHMudG9EZWNpbWFsKHR4LmJsb2NrTnVtYmVyKTtcbiAgICB0eC50cmFuc2FjdGlvbkluZGV4ID0gdXRpbHMudG9EZWNpbWFsKHR4LnRyYW5zYWN0aW9uSW5kZXgpO1xuICAgIHR4Lm5vbmNlID0gdXRpbHMudG9EZWNpbWFsKHR4Lm5vbmNlKTtcbiAgICB0eC5nYXMgPSB1dGlscy50b0RlY2ltYWwodHguZ2FzKTtcbiAgICB0eC5nYXNQcmljZSA9IHV0aWxzLnRvQmlnTnVtYmVyKHR4Lmdhc1ByaWNlKTtcbiAgICB0eC52YWx1ZSA9IHV0aWxzLnRvQmlnTnVtYmVyKHR4LnZhbHVlKTtcbiAgICByZXR1cm4gdHg7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgdGhlIG91dHB1dCBvZiBhIGJsb2NrIHRvIGl0cyBwcm9wZXIgdmFsdWVzXG4gKlxuICogQG1ldGhvZCBvdXRwdXRCbG9ja0Zvcm1hdHRlclxuICogQHBhcmFtIHtPYmplY3R9IGJsb2NrIG9iamVjdCBcbiAqIEByZXR1cm5zIHtPYmplY3R9IGJsb2NrIG9iamVjdFxuKi9cbnZhciBvdXRwdXRCbG9ja0Zvcm1hdHRlciA9IGZ1bmN0aW9uKGJsb2NrKSB7XG5cbiAgICAvLyB0cmFuc2Zvcm0gdG8gbnVtYmVyXG4gICAgYmxvY2suZ2FzTGltaXQgPSB1dGlscy50b0RlY2ltYWwoYmxvY2suZ2FzTGltaXQpO1xuICAgIGJsb2NrLmdhc1VzZWQgPSB1dGlscy50b0RlY2ltYWwoYmxvY2suZ2FzVXNlZCk7XG4gICAgYmxvY2suc2l6ZSA9IHV0aWxzLnRvRGVjaW1hbChibG9jay5zaXplKTtcbiAgICBibG9jay50aW1lc3RhbXAgPSB1dGlscy50b0RlY2ltYWwoYmxvY2sudGltZXN0YW1wKTtcbiAgICBibG9jay5udW1iZXIgPSB1dGlscy50b0RlY2ltYWwoYmxvY2subnVtYmVyKTtcblxuICAgIGJsb2NrLmRpZmZpY3VsdHkgPSB1dGlscy50b0JpZ051bWJlcihibG9jay5kaWZmaWN1bHR5KTtcbiAgICBibG9jay50b3RhbERpZmZpY3VsdHkgPSB1dGlscy50b0JpZ051bWJlcihibG9jay50b3RhbERpZmZpY3VsdHkpO1xuXG4gICAgaWYgKHV0aWxzLmlzQXJyYXkoYmxvY2sudHJhbnNhY3Rpb25zKSkge1xuICAgICAgICBibG9jay50cmFuc2FjdGlvbnMuZm9yRWFjaChmdW5jdGlvbihpdGVtKXtcbiAgICAgICAgICAgIGlmKCF1dGlscy5pc1N0cmluZyhpdGVtKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gb3V0cHV0VHJhbnNhY3Rpb25Gb3JtYXR0ZXIoaXRlbSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBibG9jaztcbn07XG5cbi8qKlxuICogRm9ybWF0cyB0aGUgb3V0cHV0IG9mIGEgbG9nXG4gKiBcbiAqIEBtZXRob2Qgb3V0cHV0TG9nRm9ybWF0dGVyXG4gKiBAcGFyYW0ge09iamVjdH0gbG9nIG9iamVjdFxuICogQHJldHVybnMge09iamVjdH0gbG9nXG4qL1xudmFyIG91dHB1dExvZ0Zvcm1hdHRlciA9IGZ1bmN0aW9uKGxvZykge1xuICAgIGlmIChsb2cgPT09IG51bGwpIHsgLy8gJ3BlbmRpbmcnICYmICdsYXRlc3QnIGZpbHRlcnMgYXJlIG51bGxzXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGxvZy5ibG9ja051bWJlciA9IHV0aWxzLnRvRGVjaW1hbChsb2cuYmxvY2tOdW1iZXIpO1xuICAgIGxvZy50cmFuc2FjdGlvbkluZGV4ID0gdXRpbHMudG9EZWNpbWFsKGxvZy50cmFuc2FjdGlvbkluZGV4KTtcbiAgICBsb2cubG9nSW5kZXggPSB1dGlscy50b0RlY2ltYWwobG9nLmxvZ0luZGV4KTtcblxuICAgIHJldHVybiBsb2c7XG59O1xuXG4vKipcbiAqIEZvcm1hdHMgdGhlIGlucHV0IG9mIGEgd2hpc3BlciBwb3N0IGFuZCBjb252ZXJ0cyBhbGwgdmFsdWVzIHRvIEhFWFxuICpcbiAqIEBtZXRob2QgaW5wdXRQb3N0Rm9ybWF0dGVyXG4gKiBAcGFyYW0ge09iamVjdH0gdHJhbnNhY3Rpb24gb2JqZWN0XG4gKiBAcmV0dXJucyB7T2JqZWN0fVxuKi9cbnZhciBpbnB1dFBvc3RGb3JtYXR0ZXIgPSBmdW5jdGlvbihwb3N0KSB7XG5cbiAgICBwb3N0LnBheWxvYWQgPSB1dGlscy50b0hleChwb3N0LnBheWxvYWQpO1xuICAgIHBvc3QudHRsID0gdXRpbHMuZnJvbURlY2ltYWwocG9zdC50dGwpO1xuICAgIHBvc3Qud29ya1RvUHJvdmUgPSB1dGlscy5mcm9tRGVjaW1hbChwb3N0LndvcmtUb1Byb3ZlKTtcbiAgICBwb3N0LnByaW9yaXR5ID0gdXRpbHMuZnJvbURlY2ltYWwocG9zdC5wcmlvcml0eSk7XG5cbiAgICAvLyBmYWxsYmFja1xuICAgIGlmICghdXRpbHMuaXNBcnJheShwb3N0LnRvcGljcykpIHtcbiAgICAgICAgcG9zdC50b3BpY3MgPSBwb3N0LnRvcGljcyA/IFtwb3N0LnRvcGljc10gOiBbXTtcbiAgICB9XG5cbiAgICAvLyBmb3JtYXQgdGhlIGZvbGxvd2luZyBvcHRpb25zXG4gICAgcG9zdC50b3BpY3MgPSBwb3N0LnRvcGljcy5tYXAoZnVuY3Rpb24odG9waWMpe1xuICAgICAgICByZXR1cm4gdXRpbHMuZnJvbUFzY2lpKHRvcGljKTtcbiAgICB9KTtcblxuICAgIHJldHVybiBwb3N0OyBcbn07XG5cbi8qKlxuICogRm9ybWF0cyB0aGUgb3V0cHV0IG9mIGEgcmVjZWl2ZWQgcG9zdCBtZXNzYWdlXG4gKlxuICogQG1ldGhvZCBvdXRwdXRQb3N0Rm9ybWF0dGVyXG4gKiBAcGFyYW0ge09iamVjdH1cbiAqIEByZXR1cm5zIHtPYmplY3R9XG4gKi9cbnZhciBvdXRwdXRQb3N0Rm9ybWF0dGVyID0gZnVuY3Rpb24ocG9zdCl7XG5cbiAgICBwb3N0LmV4cGlyeSA9IHV0aWxzLnRvRGVjaW1hbChwb3N0LmV4cGlyeSk7XG4gICAgcG9zdC5zZW50ID0gdXRpbHMudG9EZWNpbWFsKHBvc3Quc2VudCk7XG4gICAgcG9zdC50dGwgPSB1dGlscy50b0RlY2ltYWwocG9zdC50dGwpO1xuICAgIHBvc3Qud29ya1Byb3ZlZCA9IHV0aWxzLnRvRGVjaW1hbChwb3N0LndvcmtQcm92ZWQpO1xuICAgIHBvc3QucGF5bG9hZFJhdyA9IHBvc3QucGF5bG9hZDtcbiAgICBwb3N0LnBheWxvYWQgPSB1dGlscy50b0FzY2lpKHBvc3QucGF5bG9hZCk7XG5cbiAgICBpZiAodXRpbHMuaXNKc29uKHBvc3QucGF5bG9hZCkpIHtcbiAgICAgICAgcG9zdC5wYXlsb2FkID0gSlNPTi5wYXJzZShwb3N0LnBheWxvYWQpO1xuICAgIH1cblxuICAgIC8vIGZvcm1hdCB0aGUgZm9sbG93aW5nIG9wdGlvbnNcbiAgICBpZiAoIXBvc3QudG9waWNzKSB7XG4gICAgICAgIHBvc3QudG9waWNzID0gW107XG4gICAgfVxuICAgIHBvc3QudG9waWNzID0gcG9zdC50b3BpY3MubWFwKGZ1bmN0aW9uKHRvcGljKXtcbiAgICAgICAgcmV0dXJuIHV0aWxzLnRvQXNjaWkodG9waWMpO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHBvc3Q7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBpbnB1dERlZmF1bHRCbG9ja051bWJlckZvcm1hdHRlcjogaW5wdXREZWZhdWx0QmxvY2tOdW1iZXJGb3JtYXR0ZXIsXG4gICAgaW5wdXRCbG9ja051bWJlckZvcm1hdHRlcjogaW5wdXRCbG9ja051bWJlckZvcm1hdHRlcixcbiAgICBpbnB1dFRyYW5zYWN0aW9uRm9ybWF0dGVyOiBpbnB1dFRyYW5zYWN0aW9uRm9ybWF0dGVyLFxuICAgIGlucHV0UG9zdEZvcm1hdHRlcjogaW5wdXRQb3N0Rm9ybWF0dGVyLFxuICAgIG91dHB1dEJpZ051bWJlckZvcm1hdHRlcjogb3V0cHV0QmlnTnVtYmVyRm9ybWF0dGVyLFxuICAgIG91dHB1dFRyYW5zYWN0aW9uRm9ybWF0dGVyOiBvdXRwdXRUcmFuc2FjdGlvbkZvcm1hdHRlcixcbiAgICBvdXRwdXRCbG9ja0Zvcm1hdHRlcjogb3V0cHV0QmxvY2tGb3JtYXR0ZXIsXG4gICAgb3V0cHV0TG9nRm9ybWF0dGVyOiBvdXRwdXRMb2dGb3JtYXR0ZXIsXG4gICAgb3V0cHV0UG9zdEZvcm1hdHRlcjogb3V0cHV0UG9zdEZvcm1hdHRlclxufTtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKipcbiAqIEBmaWxlIGZ1bmN0aW9uLmpzXG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciB3ZWIzID0gcmVxdWlyZSgnLi4vd2ViMycpO1xudmFyIGNvZGVyID0gcmVxdWlyZSgnLi4vc29saWRpdHkvY29kZXInKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG52YXIgc2hhMyA9IHJlcXVpcmUoJy4uL3V0aWxzL3NoYTMnKTtcblxuLyoqXG4gKiBUaGlzIHByb3RvdHlwZSBzaG91bGQgYmUgdXNlZCB0byBjYWxsL3NlbmRUcmFuc2FjdGlvbiB0byBzb2xpZGl0eSBmdW5jdGlvbnNcbiAqL1xudmFyIFNvbGlkaXR5RnVuY3Rpb24gPSBmdW5jdGlvbiAoanNvbiwgYWRkcmVzcykge1xuICAgIHRoaXMuX2lucHV0VHlwZXMgPSBqc29uLmlucHV0cy5tYXAoZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgcmV0dXJuIGkudHlwZTtcbiAgICB9KTtcbiAgICB0aGlzLl9vdXRwdXRUeXBlcyA9IGpzb24ub3V0cHV0cy5tYXAoZnVuY3Rpb24gKGkpIHtcbiAgICAgICAgcmV0dXJuIGkudHlwZTtcbiAgICB9KTtcbiAgICB0aGlzLl9jb25zdGFudCA9IGpzb24uY29uc3RhbnQ7XG4gICAgdGhpcy5fbmFtZSA9IHV0aWxzLnRyYW5zZm9ybVRvRnVsbE5hbWUoanNvbik7XG4gICAgdGhpcy5fYWRkcmVzcyA9IGFkZHJlc3M7XG59O1xuXG5Tb2xpZGl0eUZ1bmN0aW9uLnByb3RvdHlwZS5leHRyYWN0Q2FsbGJhY2sgPSBmdW5jdGlvbiAoYXJncykge1xuICAgIGlmICh1dGlscy5pc0Z1bmN0aW9uKGFyZ3NbYXJncy5sZW5ndGggLSAxXSkpIHtcbiAgICAgICAgcmV0dXJuIGFyZ3MucG9wKCk7IC8vIG1vZGlmeSB0aGUgYXJncyBhcnJheSFcbiAgICB9XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGNyZWF0ZSBwYXlsb2FkIGZyb20gYXJndW1lbnRzXG4gKlxuICogQG1ldGhvZCB0b1BheWxvYWRcbiAqIEBwYXJhbSB7QXJyYXl9IHNvbGlkaXR5IGZ1bmN0aW9uIHBhcmFtc1xuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbmFsIHBheWxvYWQgb3B0aW9uc1xuICovXG5Tb2xpZGl0eUZ1bmN0aW9uLnByb3RvdHlwZS50b1BheWxvYWQgPSBmdW5jdGlvbiAoYXJncykge1xuICAgIHZhciBvcHRpb25zID0ge307XG4gICAgaWYgKGFyZ3MubGVuZ3RoID4gdGhpcy5faW5wdXRUeXBlcy5sZW5ndGggJiYgdXRpbHMuaXNPYmplY3QoYXJnc1thcmdzLmxlbmd0aCAtMV0pKSB7XG4gICAgICAgIG9wdGlvbnMgPSBhcmdzW2FyZ3MubGVuZ3RoIC0gMV07XG4gICAgfVxuICAgIG9wdGlvbnMudG8gPSB0aGlzLl9hZGRyZXNzO1xuICAgIG9wdGlvbnMuZGF0YSA9ICcweCcgKyB0aGlzLnNpZ25hdHVyZSgpICsgY29kZXIuZW5jb2RlUGFyYW1zKHRoaXMuX2lucHV0VHlwZXMsIGFyZ3MpO1xuICAgIHJldHVybiBvcHRpb25zO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBnZXQgZnVuY3Rpb24gc2lnbmF0dXJlXG4gKlxuICogQG1ldGhvZCBzaWduYXR1cmVcbiAqIEByZXR1cm4ge1N0cmluZ30gZnVuY3Rpb24gc2lnbmF0dXJlXG4gKi9cblNvbGlkaXR5RnVuY3Rpb24ucHJvdG90eXBlLnNpZ25hdHVyZSA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gc2hhMyh0aGlzLl9uYW1lKS5zbGljZSgwLCA4KTtcbn07XG5cblxuU29saWRpdHlGdW5jdGlvbi5wcm90b3R5cGUudW5wYWNrT3V0cHV0ID0gZnVuY3Rpb24gKG91dHB1dCkge1xuICAgIGlmICghb3V0cHV0KSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBvdXRwdXQgPSBvdXRwdXQubGVuZ3RoID49IDIgPyBvdXRwdXQuc2xpY2UoMikgOiBvdXRwdXQ7XG4gICAgdmFyIHJlc3VsdCA9IGNvZGVyLmRlY29kZVBhcmFtcyh0aGlzLl9vdXRwdXRUeXBlcywgb3V0cHV0KTtcbiAgICByZXR1cm4gcmVzdWx0Lmxlbmd0aCA9PT0gMSA/IHJlc3VsdFswXSA6IHJlc3VsdDtcbn07XG5cbi8qKlxuICogQ2FsbHMgYSBjb250cmFjdCBmdW5jdGlvbi5cbiAqXG4gKiBAbWV0aG9kIGNhbGxcbiAqIEBwYXJhbSB7Li4uT2JqZWN0fSBDb250cmFjdCBmdW5jdGlvbiBhcmd1bWVudHNcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IElmIHRoZSBsYXN0IGFyZ3VtZW50IGlzIGEgZnVuY3Rpb24sIHRoZSBjb250cmFjdCBmdW5jdGlvblxuICogICBjYWxsIHdpbGwgYmUgYXN5bmNocm9ub3VzLCBhbmQgdGhlIGNhbGxiYWNrIHdpbGwgYmUgcGFzc2VkIHRoZVxuICogICBlcnJvciBhbmQgcmVzdWx0LlxuICogQHJldHVybiB7U3RyaW5nfSBvdXRwdXQgYnl0ZXNcbiAqL1xuU29saWRpdHlGdW5jdGlvbi5wcm90b3R5cGUuY2FsbCA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cykuZmlsdGVyKGZ1bmN0aW9uIChhKSB7cmV0dXJuIGEgIT09IHVuZGVmaW5lZDsgfSk7XG4gICAgdmFyIGNhbGxiYWNrID0gdGhpcy5leHRyYWN0Q2FsbGJhY2soYXJncyk7XG4gICAgdmFyIHBheWxvYWQgPSB0aGlzLnRvUGF5bG9hZChhcmdzKTtcblxuICAgIGlmICghY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIG91dHB1dCA9IHdlYjMuZXRoLmNhbGwocGF5bG9hZCk7XG4gICAgICAgIHJldHVybiB0aGlzLnVucGFja091dHB1dChvdXRwdXQpO1xuICAgIH0gXG4gICAgICAgIFxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICB3ZWIzLmV0aC5jYWxsKHBheWxvYWQsIGZ1bmN0aW9uIChlcnJvciwgb3V0cHV0KSB7XG4gICAgICAgIGNhbGxiYWNrKGVycm9yLCBzZWxmLnVucGFja091dHB1dChvdXRwdXQpKTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gc2VuZFRyYW5zYWN0aW9uIHRvIHNvbGlkaXR5IGZ1bmN0aW9uXG4gKlxuICogQG1ldGhvZCBzZW5kVHJhbnNhY3Rpb25cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKi9cblNvbGlkaXR5RnVuY3Rpb24ucHJvdG90eXBlLnNlbmRUcmFuc2FjdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cykuZmlsdGVyKGZ1bmN0aW9uIChhKSB7cmV0dXJuIGEgIT09IHVuZGVmaW5lZDsgfSk7XG4gICAgdmFyIGNhbGxiYWNrID0gdGhpcy5leHRyYWN0Q2FsbGJhY2soYXJncyk7XG4gICAgdmFyIHBheWxvYWQgPSB0aGlzLnRvUGF5bG9hZChhcmdzKTtcblxuICAgIGlmICghY2FsbGJhY2spIHtcbiAgICAgICAgcmV0dXJuIHdlYjMuZXRoLnNlbmRUcmFuc2FjdGlvbihwYXlsb2FkKTtcbiAgICB9XG5cbiAgICB3ZWIzLmV0aC5zZW5kVHJhbnNhY3Rpb24ocGF5bG9hZCwgY2FsbGJhY2spO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBlc3RpbWF0ZUdhcyBvZiBzb2xpZGl0eSBmdW5jdGlvblxuICpcbiAqIEBtZXRob2QgZXN0aW1hdGVHYXNcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKi9cblNvbGlkaXR5RnVuY3Rpb24ucHJvdG90eXBlLmVzdGltYXRlR2FzID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICB2YXIgY2FsbGJhY2sgPSB0aGlzLmV4dHJhY3RDYWxsYmFjayhhcmdzKTtcbiAgICB2YXIgcGF5bG9hZCA9IHRoaXMudG9QYXlsb2FkKGFyZ3MpO1xuXG4gICAgaWYgKCFjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4gd2ViMy5ldGguZXN0aW1hdGVHYXMocGF5bG9hZCk7XG4gICAgfVxuXG4gICAgd2ViMy5ldGguZXN0aW1hdGVHYXMocGF5bG9hZCwgY2FsbGJhY2spO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBnZXQgZnVuY3Rpb24gZGlzcGxheSBuYW1lXG4gKlxuICogQG1ldGhvZCBkaXNwbGF5TmFtZVxuICogQHJldHVybiB7U3RyaW5nfSBkaXNwbGF5IG5hbWUgb2YgdGhlIGZ1bmN0aW9uXG4gKi9cblNvbGlkaXR5RnVuY3Rpb24ucHJvdG90eXBlLmRpc3BsYXlOYW1lID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB1dGlscy5leHRyYWN0RGlzcGxheU5hbWUodGhpcy5fbmFtZSk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGdldCBmdW5jdGlvbiB0eXBlIG5hbWVcbiAqXG4gKiBAbWV0aG9kIHR5cGVOYW1lXG4gKiBAcmV0dXJuIHtTdHJpbmd9IHR5cGUgbmFtZSBvZiB0aGUgZnVuY3Rpb25cbiAqL1xuU29saWRpdHlGdW5jdGlvbi5wcm90b3R5cGUudHlwZU5hbWUgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHV0aWxzLmV4dHJhY3RUeXBlTmFtZSh0aGlzLl9uYW1lKTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBnZXQgcnBjIHJlcXVlc3RzIGZyb20gc29saWRpdHkgZnVuY3Rpb25cbiAqXG4gKiBAbWV0aG9kIHJlcXVlc3RcbiAqIEByZXR1cm5zIHtPYmplY3R9XG4gKi9cblNvbGlkaXR5RnVuY3Rpb24ucHJvdG90eXBlLnJlcXVlc3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgIHZhciBjYWxsYmFjayA9IHRoaXMuZXh0cmFjdENhbGxiYWNrKGFyZ3MpO1xuICAgIHZhciBwYXlsb2FkID0gdGhpcy50b1BheWxvYWQoYXJncyk7XG4gICAgdmFyIGZvcm1hdCA9IHRoaXMudW5wYWNrT3V0cHV0LmJpbmQodGhpcyk7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgICAgY2FsbGJhY2s6IGNhbGxiYWNrLFxuICAgICAgICBwYXlsb2FkOiBwYXlsb2FkLCBcbiAgICAgICAgZm9ybWF0OiBmb3JtYXRcbiAgICB9O1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGV4ZWN1dGUgZnVuY3Rpb25cbiAqXG4gKiBAbWV0aG9kIGV4ZWN1dGVcbiAqL1xuU29saWRpdHlGdW5jdGlvbi5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgdHJhbnNhY3Rpb24gPSAhdGhpcy5fY29uc3RhbnQ7XG5cbiAgICAvLyBzZW5kIHRyYW5zYWN0aW9uXG4gICAgaWYgKHRyYW5zYWN0aW9uKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnNlbmRUcmFuc2FjdGlvbi5hcHBseSh0aGlzLCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpKTtcbiAgICB9XG5cbiAgICAvLyBjYWxsXG4gICAgcmV0dXJuIHRoaXMuY2FsbC5hcHBseSh0aGlzLCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpKTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBhdHRhY2ggZnVuY3Rpb24gdG8gY29udHJhY3RcbiAqXG4gKiBAbWV0aG9kIGF0dGFjaFRvQ29udHJhY3RcbiAqIEBwYXJhbSB7Q29udHJhY3R9XG4gKi9cblNvbGlkaXR5RnVuY3Rpb24ucHJvdG90eXBlLmF0dGFjaFRvQ29udHJhY3QgPSBmdW5jdGlvbiAoY29udHJhY3QpIHtcbiAgICB2YXIgZXhlY3V0ZSA9IHRoaXMuZXhlY3V0ZS5iaW5kKHRoaXMpO1xuICAgIGV4ZWN1dGUucmVxdWVzdCA9IHRoaXMucmVxdWVzdC5iaW5kKHRoaXMpO1xuICAgIGV4ZWN1dGUuY2FsbCA9IHRoaXMuY2FsbC5iaW5kKHRoaXMpO1xuICAgIGV4ZWN1dGUuc2VuZFRyYW5zYWN0aW9uID0gdGhpcy5zZW5kVHJhbnNhY3Rpb24uYmluZCh0aGlzKTtcbiAgICBleGVjdXRlLmVzdGltYXRlR2FzID0gdGhpcy5lc3RpbWF0ZUdhcy5iaW5kKHRoaXMpO1xuICAgIHZhciBkaXNwbGF5TmFtZSA9IHRoaXMuZGlzcGxheU5hbWUoKTtcbiAgICBpZiAoIWNvbnRyYWN0W2Rpc3BsYXlOYW1lXSkge1xuICAgICAgICBjb250cmFjdFtkaXNwbGF5TmFtZV0gPSBleGVjdXRlO1xuICAgIH1cbiAgICBjb250cmFjdFtkaXNwbGF5TmFtZV1bdGhpcy50eXBlTmFtZSgpXSA9IGV4ZWN1dGU7IC8vIGNpcmN1bGFyISEhIVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBTb2xpZGl0eUZ1bmN0aW9uO1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBAZmlsZSBodHRwcHJvdmlkZXIuanNcbiAqIEBhdXRob3JzOlxuICogICBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqICAgTWFyaWFuIE9hbmNlYSA8bWFyaWFuQGV0aGRldi5jb20+XG4gKiAgIEZhYmlhbiBWb2dlbHN0ZWxsZXIgPGZhYmlhbkBldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNFxuICovXG5cblwidXNlIHN0cmljdFwiO1xuXG52YXIgWE1MSHR0cFJlcXVlc3QgPSByZXF1aXJlKCd4bWxodHRwcmVxdWVzdCcpLlhNTEh0dHBSZXF1ZXN0OyAvLyBqc2hpbnQgaWdub3JlOmxpbmVcbnZhciBlcnJvcnMgPSByZXF1aXJlKCcuL2Vycm9ycycpO1xuXG52YXIgSHR0cFByb3ZpZGVyID0gZnVuY3Rpb24gKGhvc3QpIHtcbiAgICB0aGlzLmhvc3QgPSBob3N0IHx8ICdodHRwOi8vbG9jYWxob3N0Ojg1NDUnO1xufTtcblxuSHR0cFByb3ZpZGVyLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24gKHBheWxvYWQpIHtcbiAgICB2YXIgcmVxdWVzdCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXG4gICAgcmVxdWVzdC5vcGVuKCdQT1NUJywgdGhpcy5ob3N0LCBmYWxzZSk7XG4gICAgXG4gICAgdHJ5IHtcbiAgICAgICAgcmVxdWVzdC5zZW5kKEpTT04uc3RyaW5naWZ5KHBheWxvYWQpKTtcbiAgICB9IGNhdGNoKGVycm9yKSB7XG4gICAgICAgIHRocm93IGVycm9ycy5JbnZhbGlkQ29ubmVjdGlvbih0aGlzLmhvc3QpO1xuICAgIH1cblxuXG4gICAgLy8gY2hlY2sgcmVxdWVzdC5zdGF0dXNcbiAgICAvLyBUT0RPOiB0aHJvdyBhbiBlcnJvciBoZXJlISBpdCBjYW5ub3Qgc2lsZW50bHkgZmFpbCEhIVxuICAgIC8vaWYgKHJlcXVlc3Quc3RhdHVzICE9PSAyMDApIHtcbiAgICAgICAgLy9yZXR1cm47XG4gICAgLy99XG5cbiAgICB2YXIgcmVzdWx0ID0gcmVxdWVzdC5yZXNwb25zZVRleHQ7XG5cbiAgICB0cnkge1xuICAgICAgICByZXN1bHQgPSBKU09OLnBhcnNlKHJlc3VsdCk7XG4gICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHRocm93IGVycm9ycy5JbnZhbGlkUmVzcG9uc2UocmVzdWx0KTsgICAgICAgICAgICAgICAgXG4gICAgfVxuXG4gICAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbkh0dHBQcm92aWRlci5wcm90b3R5cGUuc2VuZEFzeW5jID0gZnVuY3Rpb24gKHBheWxvYWQsIGNhbGxiYWNrKSB7XG4gICAgdmFyIHJlcXVlc3QgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICByZXF1ZXN0Lm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAocmVxdWVzdC5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gcmVxdWVzdC5yZXNwb25zZVRleHQ7XG4gICAgICAgICAgICB2YXIgZXJyb3IgPSBudWxsO1xuXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IEpTT04ucGFyc2UocmVzdWx0KTtcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICAgIGVycm9yID0gZXJyb3JzLkludmFsaWRSZXNwb25zZShyZXN1bHQpOyAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY2FsbGJhY2soZXJyb3IsIHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgcmVxdWVzdC5vcGVuKCdQT1NUJywgdGhpcy5ob3N0LCB0cnVlKTtcblxuICAgIHRyeSB7XG4gICAgICAgIHJlcXVlc3Quc2VuZChKU09OLnN0cmluZ2lmeShwYXlsb2FkKSk7XG4gICAgfSBjYXRjaChlcnJvcikge1xuICAgICAgICBjYWxsYmFjayhlcnJvcnMuSW52YWxpZENvbm5lY3Rpb24odGhpcy5ob3N0KSk7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBIdHRwUHJvdmlkZXI7XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIFxuICogQGZpbGUgaWNhcC5qc1xuICogQGF1dGhvciBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xuXG4vKipcbiAqIFRoaXMgcHJvdG90eXBlIHNob3VsZCBiZSB1c2VkIHRvIGV4dHJhY3QgbmVjZXNzYXJ5IGluZm9ybWF0aW9uIGZyb20gaWJhbiBhZGRyZXNzXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGliYW5cbiAqL1xudmFyIElDQVAgPSBmdW5jdGlvbiAoaWJhbikge1xuICAgIHRoaXMuX2liYW4gPSBpYmFuO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGNoZWNrIGlmIGljYXAgaXMgY29ycmVjdFxuICpcbiAqIEBtZXRob2QgaXNWYWxpZFxuICogQHJldHVybnMge0Jvb2xlYW59IHRydWUgaWYgaXQgaXMsIG90aGVyd2lzZSBmYWxzZVxuICovXG5JQ0FQLnByb3RvdHlwZS5pc1ZhbGlkID0gZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB1dGlscy5pc0lCQU4odGhpcy5faWJhbik7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gY2hlY2sgaWYgaWJhbiBudW1iZXIgaXMgZGlyZWN0XG4gKlxuICogQG1ldGhvZCBpc0RpcmVjdFxuICogQHJldHVybnMge0Jvb2xlYW59IHRydWUgaWYgaXQgaXMsIG90aGVyd2lzZSBmYWxzZVxuICovXG5JQ0FQLnByb3RvdHlwZS5pc0RpcmVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5faWJhbi5sZW5ndGggPT09IDM0O1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGNoZWNrIGlmIGliYW4gbnVtYmVyIGlmIGluZGlyZWN0XG4gKlxuICogQG1ldGhvZCBpc0luZGlyZWN0XG4gKiBAcmV0dXJucyB7Qm9vbGVhbn0gdHJ1ZSBpZiBpdCBpcywgb3RoZXJ3aXNlIGZhbHNlXG4gKi9cbklDQVAucHJvdG90eXBlLmlzSW5kaXJlY3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2liYW4ubGVuZ3RoID09PSAyMDtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBnZXQgaWJhbiBjaGVja3N1bVxuICogVXNlcyB0aGUgbW9kLTk3LTEwIGNoZWNrc3VtbWluZyBwcm90b2NvbCAoSVNPL0lFQyA3MDY0OjIwMDMpXG4gKlxuICogQG1ldGhvZCBjaGVja3N1bVxuICogQHJldHVybnMge1N0cmluZ30gY2hlY2tzdW1cbiAqL1xuSUNBUC5wcm90b3R5cGUuY2hlY2tzdW0gPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuX2liYW4uc3Vic3RyKDIsIDIpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGdldCBpbnN0aXR1dGlvbiBpZGVudGlmaWVyXG4gKiBlZy4gWFJFR1xuICpcbiAqIEBtZXRob2QgaW5zdGl0dXRpb25cbiAqIEByZXR1cm5zIHtTdHJpbmd9IGluc3RpdHV0aW9uIGlkZW50aWZpZXJcbiAqL1xuSUNBUC5wcm90b3R5cGUuaW5zdGl0dXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuaXNJbmRpcmVjdCgpID8gdGhpcy5faWJhbi5zdWJzdHIoNywgNCkgOiAnJztcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBnZXQgY2xpZW50IGlkZW50aWZpZXIgd2l0aGluIGluc3RpdHV0aW9uXG4gKiBlZy4gR0FWT0ZZT1JLXG4gKlxuICogQG1ldGhvZCBjbGllbnRcbiAqIEByZXR1cm5zIHtTdHJpbmd9IGNsaWVudCBpZGVudGlmaWVyXG4gKi9cbklDQVAucHJvdG90eXBlLmNsaWVudCA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5pc0luZGlyZWN0KCkgPyB0aGlzLl9pYmFuLnN1YnN0cigxMSkgOiAnJztcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBnZXQgY2xpZW50IGRpcmVjdCBhZGRyZXNzXG4gKlxuICogQG1ldGhvZCBhZGRyZXNzXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBjbGllbnQgZGlyZWN0IGFkZHJlc3NcbiAqL1xuSUNBUC5wcm90b3R5cGUuYWRkcmVzcyA9IGZ1bmN0aW9uICgpIHtcbiAgICByZXR1cm4gdGhpcy5pc0RpcmVjdCgpID8gdGhpcy5faWJhbi5zdWJzdHIoNCkgOiAnJztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gSUNBUDtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKiogQGZpbGUganNvbnJwYy5qc1xuICogQGF1dGhvcnM6XG4gKiAgIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciBKc29ucnBjID0gZnVuY3Rpb24gKCkge1xuICAgIC8vIHNpbmdsZXRvbiBwYXR0ZXJuXG4gICAgaWYgKGFyZ3VtZW50cy5jYWxsZWUuX3NpbmdsZXRvbkluc3RhbmNlKSB7XG4gICAgICAgIHJldHVybiBhcmd1bWVudHMuY2FsbGVlLl9zaW5nbGV0b25JbnN0YW5jZTtcbiAgICB9XG4gICAgYXJndW1lbnRzLmNhbGxlZS5fc2luZ2xldG9uSW5zdGFuY2UgPSB0aGlzO1xuXG4gICAgdGhpcy5tZXNzYWdlSWQgPSAxO1xufTtcblxuLyoqXG4gKiBAcmV0dXJuIHtKc29ucnBjfSBzaW5nbGV0b25cbiAqL1xuSnNvbnJwYy5nZXRJbnN0YW5jZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgaW5zdGFuY2UgPSBuZXcgSnNvbnJwYygpO1xuICAgIHJldHVybiBpbnN0YW5jZTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byB2YWxpZCBqc29uIGNyZWF0ZSBwYXlsb2FkIG9iamVjdFxuICpcbiAqIEBtZXRob2QgdG9QYXlsb2FkXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBtZXRob2Qgb2YganNvbnJwYyBjYWxsLCByZXF1aXJlZFxuICogQHBhcmFtIHtBcnJheX0gcGFyYW1zLCBhbiBhcnJheSBvZiBtZXRob2QgcGFyYW1zLCBvcHRpb25hbFxuICogQHJldHVybnMge09iamVjdH0gdmFsaWQganNvbnJwYyBwYXlsb2FkIG9iamVjdFxuICovXG5Kc29ucnBjLnByb3RvdHlwZS50b1BheWxvYWQgPSBmdW5jdGlvbiAobWV0aG9kLCBwYXJhbXMpIHtcbiAgICBpZiAoIW1ldGhvZClcbiAgICAgICAgY29uc29sZS5lcnJvcignanNvbnJwYyBtZXRob2Qgc2hvdWxkIGJlIHNwZWNpZmllZCEnKTtcblxuICAgIHJldHVybiB7XG4gICAgICAgIGpzb25ycGM6ICcyLjAnLFxuICAgICAgICBtZXRob2Q6IG1ldGhvZCxcbiAgICAgICAgcGFyYW1zOiBwYXJhbXMgfHwgW10sXG4gICAgICAgIGlkOiB0aGlzLm1lc3NhZ2VJZCsrXG4gICAgfTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBjaGVjayBpZiBqc29ucnBjIHJlc3BvbnNlIGlzIHZhbGlkXG4gKlxuICogQG1ldGhvZCBpc1ZhbGlkUmVzcG9uc2VcbiAqIEBwYXJhbSB7T2JqZWN0fVxuICogQHJldHVybnMge0Jvb2xlYW59IHRydWUgaWYgcmVzcG9uc2UgaXMgdmFsaWQsIG90aGVyd2lzZSBmYWxzZVxuICovXG5Kc29ucnBjLnByb3RvdHlwZS5pc1ZhbGlkUmVzcG9uc2UgPSBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICByZXR1cm4gISFyZXNwb25zZSAmJlxuICAgICAgICAhcmVzcG9uc2UuZXJyb3IgJiZcbiAgICAgICAgcmVzcG9uc2UuanNvbnJwYyA9PT0gJzIuMCcgJiZcbiAgICAgICAgdHlwZW9mIHJlc3BvbnNlLmlkID09PSAnbnVtYmVyJyAmJlxuICAgICAgICByZXNwb25zZS5yZXN1bHQgIT09IHVuZGVmaW5lZDsgLy8gb25seSB1bmRlZmluZWQgaXMgbm90IHZhbGlkIGpzb24gb2JqZWN0XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gY3JlYXRlIGJhdGNoIHBheWxvYWQgb2JqZWN0XG4gKlxuICogQG1ldGhvZCB0b0JhdGNoUGF5bG9hZFxuICogQHBhcmFtIHtBcnJheX0gbWVzc2FnZXMsIGFuIGFycmF5IG9mIG9iamVjdHMgd2l0aCBtZXRob2QgKHJlcXVpcmVkKSBhbmQgcGFyYW1zIChvcHRpb25hbCkgZmllbGRzXG4gKiBAcmV0dXJucyB7QXJyYXl9IGJhdGNoIHBheWxvYWRcbiAqL1xuSnNvbnJwYy5wcm90b3R5cGUudG9CYXRjaFBheWxvYWQgPSBmdW5jdGlvbiAobWVzc2FnZXMpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgcmV0dXJuIG1lc3NhZ2VzLm1hcChmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICByZXR1cm4gc2VsZi50b1BheWxvYWQobWVzc2FnZS5tZXRob2QsIG1lc3NhZ2UucGFyYW1zKTtcbiAgICB9KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gSnNvbnJwYztcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKipcbiAqIEBmaWxlIG1ldGhvZC5qc1xuICogQGF1dGhvciBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG52YXIgUmVxdWVzdE1hbmFnZXIgPSByZXF1aXJlKCcuL3JlcXVlc3RtYW5hZ2VyJyk7XG52YXIgdXRpbHMgPSByZXF1aXJlKCcuLi91dGlscy91dGlscycpO1xudmFyIGVycm9ycyA9IHJlcXVpcmUoJy4vZXJyb3JzJyk7XG5cbnZhciBNZXRob2QgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgIHRoaXMubmFtZSA9IG9wdGlvbnMubmFtZTtcbiAgICB0aGlzLmNhbGwgPSBvcHRpb25zLmNhbGw7XG4gICAgdGhpcy5wYXJhbXMgPSBvcHRpb25zLnBhcmFtcyB8fCAwO1xuICAgIHRoaXMuaW5wdXRGb3JtYXR0ZXIgPSBvcHRpb25zLmlucHV0Rm9ybWF0dGVyO1xuICAgIHRoaXMub3V0cHV0Rm9ybWF0dGVyID0gb3B0aW9ucy5vdXRwdXRGb3JtYXR0ZXI7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGRldGVybWluZSBuYW1lIG9mIHRoZSBqc29ucnBjIG1ldGhvZCBiYXNlZCBvbiBhcmd1bWVudHNcbiAqXG4gKiBAbWV0aG9kIGdldENhbGxcbiAqIEBwYXJhbSB7QXJyYXl9IGFyZ3VtZW50c1xuICogQHJldHVybiB7U3RyaW5nfSBuYW1lIG9mIGpzb25ycGMgbWV0aG9kXG4gKi9cbk1ldGhvZC5wcm90b3R5cGUuZ2V0Q2FsbCA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gICAgcmV0dXJuIHV0aWxzLmlzRnVuY3Rpb24odGhpcy5jYWxsKSA/IHRoaXMuY2FsbChhcmdzKSA6IHRoaXMuY2FsbDtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gZXh0cmFjdCBjYWxsYmFjayBmcm9tIGFycmF5IG9mIGFyZ3VtZW50cy4gTW9kaWZpZXMgaW5wdXQgcGFyYW1cbiAqXG4gKiBAbWV0aG9kIGV4dHJhY3RDYWxsYmFja1xuICogQHBhcmFtIHtBcnJheX0gYXJndW1lbnRzXG4gKiBAcmV0dXJuIHtGdW5jdGlvbnxOdWxsfSBjYWxsYmFjaywgaWYgZXhpc3RzXG4gKi9cbk1ldGhvZC5wcm90b3R5cGUuZXh0cmFjdENhbGxiYWNrID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICBpZiAodXRpbHMuaXNGdW5jdGlvbihhcmdzW2FyZ3MubGVuZ3RoIC0gMV0pKSB7XG4gICAgICAgIHJldHVybiBhcmdzLnBvcCgpOyAvLyBtb2RpZnkgdGhlIGFyZ3MgYXJyYXkhXG4gICAgfVxufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGNoZWNrIGlmIHRoZSBudW1iZXIgb2YgYXJndW1lbnRzIGlzIGNvcnJlY3RcbiAqIFxuICogQG1ldGhvZCB2YWxpZGF0ZUFyZ3NcbiAqIEBwYXJhbSB7QXJyYXl9IGFyZ3VtZW50c1xuICogQHRocm93cyB7RXJyb3J9IGlmIGl0IGlzIG5vdFxuICovXG5NZXRob2QucHJvdG90eXBlLnZhbGlkYXRlQXJncyA9IGZ1bmN0aW9uIChhcmdzKSB7XG4gICAgaWYgKGFyZ3MubGVuZ3RoICE9PSB0aGlzLnBhcmFtcykge1xuICAgICAgICB0aHJvdyBlcnJvcnMuSW52YWxpZE51bWJlck9mUGFyYW1zKCk7XG4gICAgfVxufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgY2FsbGVkIHRvIGZvcm1hdCBpbnB1dCBhcmdzIG9mIG1ldGhvZFxuICogXG4gKiBAbWV0aG9kIGZvcm1hdElucHV0XG4gKiBAcGFyYW0ge0FycmF5fVxuICogQHJldHVybiB7QXJyYXl9XG4gKi9cbk1ldGhvZC5wcm90b3R5cGUuZm9ybWF0SW5wdXQgPSBmdW5jdGlvbiAoYXJncykge1xuICAgIGlmICghdGhpcy5pbnB1dEZvcm1hdHRlcikge1xuICAgICAgICByZXR1cm4gYXJncztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5pbnB1dEZvcm1hdHRlci5tYXAoZnVuY3Rpb24gKGZvcm1hdHRlciwgaW5kZXgpIHtcbiAgICAgICAgcmV0dXJuIGZvcm1hdHRlciA/IGZvcm1hdHRlcihhcmdzW2luZGV4XSkgOiBhcmdzW2luZGV4XTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBmb3JtYXQgb3V0cHV0KHJlc3VsdCkgb2YgbWV0aG9kXG4gKlxuICogQG1ldGhvZCBmb3JtYXRPdXRwdXRcbiAqIEBwYXJhbSB7T2JqZWN0fVxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5NZXRob2QucHJvdG90eXBlLmZvcm1hdE91dHB1dCA9IGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICByZXR1cm4gdGhpcy5vdXRwdXRGb3JtYXR0ZXIgJiYgcmVzdWx0ICE9PSBudWxsID8gdGhpcy5vdXRwdXRGb3JtYXR0ZXIocmVzdWx0KSA6IHJlc3VsdDtcbn07XG5cbi8qKlxuICogU2hvdWxkIGF0dGFjaCBmdW5jdGlvbiB0byBtZXRob2RcbiAqIFxuICogQG1ldGhvZCBhdHRhY2hUb09iamVjdFxuICogQHBhcmFtIHtPYmplY3R9XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufVxuICovXG5NZXRob2QucHJvdG90eXBlLmF0dGFjaFRvT2JqZWN0ID0gZnVuY3Rpb24gKG9iaikge1xuICAgIHZhciBmdW5jID0gdGhpcy5zZW5kLmJpbmQodGhpcyk7XG4gICAgZnVuYy5yZXF1ZXN0ID0gdGhpcy5yZXF1ZXN0LmJpbmQodGhpcyk7XG4gICAgZnVuYy5jYWxsID0gdGhpcy5jYWxsOyAvLyB0aGF0J3MgdWdseS4gZmlsdGVyLmpzIHVzZXMgaXRcbiAgICB2YXIgbmFtZSA9IHRoaXMubmFtZS5zcGxpdCgnLicpO1xuICAgIGlmIChuYW1lLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgb2JqW25hbWVbMF1dID0gb2JqW25hbWVbMF1dIHx8IHt9O1xuICAgICAgICBvYmpbbmFtZVswXV1bbmFtZVsxXV0gPSBmdW5jO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG9ialtuYW1lWzBdXSA9IGZ1bmM7IFxuICAgIH1cbn07XG5cbi8qKlxuICogU2hvdWxkIGNyZWF0ZSBwYXlsb2FkIGZyb20gZ2l2ZW4gaW5wdXQgYXJnc1xuICpcbiAqIEBtZXRob2QgdG9QYXlsb2FkXG4gKiBAcGFyYW0ge0FycmF5fSBhcmdzXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cbk1ldGhvZC5wcm90b3R5cGUudG9QYXlsb2FkID0gZnVuY3Rpb24gKGFyZ3MpIHtcbiAgICB2YXIgY2FsbCA9IHRoaXMuZ2V0Q2FsbChhcmdzKTtcbiAgICB2YXIgY2FsbGJhY2sgPSB0aGlzLmV4dHJhY3RDYWxsYmFjayhhcmdzKTtcbiAgICB2YXIgcGFyYW1zID0gdGhpcy5mb3JtYXRJbnB1dChhcmdzKTtcbiAgICB0aGlzLnZhbGlkYXRlQXJncyhwYXJhbXMpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbWV0aG9kOiBjYWxsLFxuICAgICAgICBwYXJhbXM6IHBhcmFtcyxcbiAgICAgICAgY2FsbGJhY2s6IGNhbGxiYWNrXG4gICAgfTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBjcmVhdGUgcHVyZSBKU09OUlBDIHJlcXVlc3Qgd2hpY2ggY2FuIGJlIHVzZWQgaW4gYmF0Y2ggcmVxdWVzdFxuICpcbiAqIEBtZXRob2QgcmVxdWVzdFxuICogQHBhcmFtIHsuLi59IHBhcmFtc1xuICogQHJldHVybiB7T2JqZWN0fSBqc29ucnBjIHJlcXVlc3RcbiAqL1xuTWV0aG9kLnByb3RvdHlwZS5yZXF1ZXN0ID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBwYXlsb2FkID0gdGhpcy50b1BheWxvYWQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSk7XG4gICAgcGF5bG9hZC5mb3JtYXQgPSB0aGlzLmZvcm1hdE91dHB1dC5iaW5kKHRoaXMpO1xuICAgIHJldHVybiBwYXlsb2FkO1xufTtcblxuLyoqXG4gKiBTaG91bGQgc2VuZCByZXF1ZXN0IHRvIHRoZSBBUElcbiAqXG4gKiBAbWV0aG9kIHNlbmRcbiAqIEBwYXJhbSBsaXN0IG9mIHBhcmFtc1xuICogQHJldHVybiByZXN1bHRcbiAqL1xuTWV0aG9kLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24gKCkge1xuICAgIHZhciBwYXlsb2FkID0gdGhpcy50b1BheWxvYWQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKSk7XG4gICAgaWYgKHBheWxvYWQuY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgICAgICByZXR1cm4gUmVxdWVzdE1hbmFnZXIuZ2V0SW5zdGFuY2UoKS5zZW5kQXN5bmMocGF5bG9hZCwgZnVuY3Rpb24gKGVyciwgcmVzdWx0KSB7XG4gICAgICAgICAgICBwYXlsb2FkLmNhbGxiYWNrKGVyciwgc2VsZi5mb3JtYXRPdXRwdXQocmVzdWx0KSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5mb3JtYXRPdXRwdXQoUmVxdWVzdE1hbmFnZXIuZ2V0SW5zdGFuY2UoKS5zZW5kKHBheWxvYWQpKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gTWV0aG9kO1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBcbiAqIEBmaWxlIG5hbWVyZWcuanNcbiAqIEBhdXRob3IgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiBAZGF0ZSAyMDE1XG4gKi9cblxudmFyIGNvbnRyYWN0ID0gcmVxdWlyZSgnLi9jb250cmFjdCcpO1xuXG52YXIgYWRkcmVzcyA9ICcweGM2ZDlkMmNkNDQ5YTc1NGM0OTQyNjRlMTgwOWM1MGUzNGQ2NDU2MmInO1xuXG52YXIgYWJpID0gW1xuICAgIHtcImNvbnN0YW50XCI6dHJ1ZSxcImlucHV0c1wiOlt7XCJuYW1lXCI6XCJfb3duZXJcIixcInR5cGVcIjpcImFkZHJlc3NcIn1dLFwibmFtZVwiOlwibmFtZVwiLFwib3V0cHV0c1wiOlt7XCJuYW1lXCI6XCJvX25hbWVcIixcInR5cGVcIjpcImJ5dGVzMzJcIn1dLFwidHlwZVwiOlwiZnVuY3Rpb25cIn0sXG4gICAge1wiY29uc3RhbnRcIjp0cnVlLFwiaW5wdXRzXCI6W3tcIm5hbWVcIjpcIl9uYW1lXCIsXCJ0eXBlXCI6XCJieXRlczMyXCJ9XSxcIm5hbWVcIjpcIm93bmVyXCIsXCJvdXRwdXRzXCI6W3tcIm5hbWVcIjpcIlwiLFwidHlwZVwiOlwiYWRkcmVzc1wifV0sXCJ0eXBlXCI6XCJmdW5jdGlvblwifSxcbiAgICB7XCJjb25zdGFudFwiOnRydWUsXCJpbnB1dHNcIjpbe1wibmFtZVwiOlwiX25hbWVcIixcInR5cGVcIjpcImJ5dGVzMzJcIn1dLFwibmFtZVwiOlwiY29udGVudFwiLFwib3V0cHV0c1wiOlt7XCJuYW1lXCI6XCJcIixcInR5cGVcIjpcImJ5dGVzMzJcIn1dLFwidHlwZVwiOlwiZnVuY3Rpb25cIn0sXG4gICAge1wiY29uc3RhbnRcIjp0cnVlLFwiaW5wdXRzXCI6W3tcIm5hbWVcIjpcIl9uYW1lXCIsXCJ0eXBlXCI6XCJieXRlczMyXCJ9XSxcIm5hbWVcIjpcImFkZHJcIixcIm91dHB1dHNcIjpbe1wibmFtZVwiOlwiXCIsXCJ0eXBlXCI6XCJhZGRyZXNzXCJ9XSxcInR5cGVcIjpcImZ1bmN0aW9uXCJ9LFxuICAgIHtcImNvbnN0YW50XCI6ZmFsc2UsXCJpbnB1dHNcIjpbe1wibmFtZVwiOlwiX25hbWVcIixcInR5cGVcIjpcImJ5dGVzMzJcIn1dLFwibmFtZVwiOlwicmVzZXJ2ZVwiLFwib3V0cHV0c1wiOltdLFwidHlwZVwiOlwiZnVuY3Rpb25cIn0sXG4gICAge1wiY29uc3RhbnRcIjp0cnVlLFwiaW5wdXRzXCI6W3tcIm5hbWVcIjpcIl9uYW1lXCIsXCJ0eXBlXCI6XCJieXRlczMyXCJ9XSxcIm5hbWVcIjpcInN1YlJlZ2lzdHJhclwiLFwib3V0cHV0c1wiOlt7XCJuYW1lXCI6XCJvX3N1YlJlZ2lzdHJhclwiLFwidHlwZVwiOlwiYWRkcmVzc1wifV0sXCJ0eXBlXCI6XCJmdW5jdGlvblwifSxcbiAgICB7XCJjb25zdGFudFwiOmZhbHNlLFwiaW5wdXRzXCI6W3tcIm5hbWVcIjpcIl9uYW1lXCIsXCJ0eXBlXCI6XCJieXRlczMyXCJ9LHtcIm5hbWVcIjpcIl9uZXdPd25lclwiLFwidHlwZVwiOlwiYWRkcmVzc1wifV0sXCJuYW1lXCI6XCJ0cmFuc2ZlclwiLFwib3V0cHV0c1wiOltdLFwidHlwZVwiOlwiZnVuY3Rpb25cIn0sXG4gICAge1wiY29uc3RhbnRcIjpmYWxzZSxcImlucHV0c1wiOlt7XCJuYW1lXCI6XCJfbmFtZVwiLFwidHlwZVwiOlwiYnl0ZXMzMlwifSx7XCJuYW1lXCI6XCJfcmVnaXN0cmFyXCIsXCJ0eXBlXCI6XCJhZGRyZXNzXCJ9XSxcIm5hbWVcIjpcInNldFN1YlJlZ2lzdHJhclwiLFwib3V0cHV0c1wiOltdLFwidHlwZVwiOlwiZnVuY3Rpb25cIn0sXG4gICAge1wiY29uc3RhbnRcIjpmYWxzZSxcImlucHV0c1wiOltdLFwibmFtZVwiOlwiUmVnaXN0cmFyXCIsXCJvdXRwdXRzXCI6W10sXCJ0eXBlXCI6XCJmdW5jdGlvblwifSxcbiAgICB7XCJjb25zdGFudFwiOmZhbHNlLFwiaW5wdXRzXCI6W3tcIm5hbWVcIjpcIl9uYW1lXCIsXCJ0eXBlXCI6XCJieXRlczMyXCJ9LHtcIm5hbWVcIjpcIl9hXCIsXCJ0eXBlXCI6XCJhZGRyZXNzXCJ9LHtcIm5hbWVcIjpcIl9wcmltYXJ5XCIsXCJ0eXBlXCI6XCJib29sXCJ9XSxcIm5hbWVcIjpcInNldEFkZHJlc3NcIixcIm91dHB1dHNcIjpbXSxcInR5cGVcIjpcImZ1bmN0aW9uXCJ9LFxuICAgIHtcImNvbnN0YW50XCI6ZmFsc2UsXCJpbnB1dHNcIjpbe1wibmFtZVwiOlwiX25hbWVcIixcInR5cGVcIjpcImJ5dGVzMzJcIn0se1wibmFtZVwiOlwiX2NvbnRlbnRcIixcInR5cGVcIjpcImJ5dGVzMzJcIn1dLFwibmFtZVwiOlwic2V0Q29udGVudFwiLFwib3V0cHV0c1wiOltdLFwidHlwZVwiOlwiZnVuY3Rpb25cIn0sXG4gICAge1wiY29uc3RhbnRcIjpmYWxzZSxcImlucHV0c1wiOlt7XCJuYW1lXCI6XCJfbmFtZVwiLFwidHlwZVwiOlwiYnl0ZXMzMlwifV0sXCJuYW1lXCI6XCJkaXNvd25cIixcIm91dHB1dHNcIjpbXSxcInR5cGVcIjpcImZ1bmN0aW9uXCJ9LFxuICAgIHtcImNvbnN0YW50XCI6dHJ1ZSxcImlucHV0c1wiOlt7XCJuYW1lXCI6XCJfbmFtZVwiLFwidHlwZVwiOlwiYnl0ZXMzMlwifV0sXCJuYW1lXCI6XCJyZWdpc3RlclwiLFwib3V0cHV0c1wiOlt7XCJuYW1lXCI6XCJcIixcInR5cGVcIjpcImFkZHJlc3NcIn1dLFwidHlwZVwiOlwiZnVuY3Rpb25cIn0sXG4gICAge1wiYW5vbnltb3VzXCI6ZmFsc2UsXCJpbnB1dHNcIjpbe1wiaW5kZXhlZFwiOnRydWUsXCJuYW1lXCI6XCJuYW1lXCIsXCJ0eXBlXCI6XCJieXRlczMyXCJ9XSxcIm5hbWVcIjpcIkNoYW5nZWRcIixcInR5cGVcIjpcImV2ZW50XCJ9LFxuICAgIHtcImFub255bW91c1wiOmZhbHNlLFwiaW5wdXRzXCI6W3tcImluZGV4ZWRcIjp0cnVlLFwibmFtZVwiOlwibmFtZVwiLFwidHlwZVwiOlwiYnl0ZXMzMlwifSx7XCJpbmRleGVkXCI6dHJ1ZSxcIm5hbWVcIjpcImFkZHJcIixcInR5cGVcIjpcImFkZHJlc3NcIn1dLFwibmFtZVwiOlwiUHJpbWFyeUNoYW5nZWRcIixcInR5cGVcIjpcImV2ZW50XCJ9XG5dO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNvbnRyYWN0KGFiaSkuYXQoYWRkcmVzcyk7XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIEBmaWxlIGV0aC5qc1xuICogQGF1dGhvcnM6XG4gKiAgIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciB1dGlscyA9IHJlcXVpcmUoJy4uL3V0aWxzL3V0aWxzJyk7XG52YXIgUHJvcGVydHkgPSByZXF1aXJlKCcuL3Byb3BlcnR5Jyk7XG5cbi8vLyBAcmV0dXJucyBhbiBhcnJheSBvZiBvYmplY3RzIGRlc2NyaWJpbmcgd2ViMy5ldGggYXBpIG1ldGhvZHNcbnZhciBtZXRob2RzID0gW1xuXTtcblxuLy8vIEByZXR1cm5zIGFuIGFycmF5IG9mIG9iamVjdHMgZGVzY3JpYmluZyB3ZWIzLmV0aCBhcGkgcHJvcGVydGllc1xudmFyIHByb3BlcnRpZXMgPSBbXG4gICAgbmV3IFByb3BlcnR5KHtcbiAgICAgICAgbmFtZTogJ2xpc3RlbmluZycsXG4gICAgICAgIGdldHRlcjogJ25ldF9saXN0ZW5pbmcnXG4gICAgfSksXG4gICAgbmV3IFByb3BlcnR5KHtcbiAgICAgICAgbmFtZTogJ3BlZXJDb3VudCcsXG4gICAgICAgIGdldHRlcjogJ25ldF9wZWVyQ291bnQnLFxuICAgICAgICBvdXRwdXRGb3JtYXR0ZXI6IHV0aWxzLnRvRGVjaW1hbFxuICAgIH0pXG5dO1xuXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIG1ldGhvZHM6IG1ldGhvZHMsXG4gICAgcHJvcGVydGllczogcHJvcGVydGllc1xufTtcblxuIiwiLypcbiAgICBUaGlzIGZpbGUgaXMgcGFydCBvZiBldGhlcmV1bS5qcy5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGZyZWUgc29mdHdhcmU6IHlvdSBjYW4gcmVkaXN0cmlidXRlIGl0IGFuZC9vciBtb2RpZnlcbiAgICBpdCB1bmRlciB0aGUgdGVybXMgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBhcyBwdWJsaXNoZWQgYnlcbiAgICB0aGUgRnJlZSBTb2Z0d2FyZSBGb3VuZGF0aW9uLCBlaXRoZXIgdmVyc2lvbiAzIG9mIHRoZSBMaWNlbnNlLCBvclxuICAgIChhdCB5b3VyIG9wdGlvbikgYW55IGxhdGVyIHZlcnNpb24uXG5cbiAgICBldGhlcmV1bS5qcyBpcyBkaXN0cmlidXRlZCBpbiB0aGUgaG9wZSB0aGF0IGl0IHdpbGwgYmUgdXNlZnVsLFxuICAgIGJ1dCBXSVRIT1VUIEFOWSBXQVJSQU5UWTsgd2l0aG91dCBldmVuIHRoZSBpbXBsaWVkIHdhcnJhbnR5IG9mXG4gICAgTUVSQ0hBTlRBQklMSVRZIG9yIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFLiAgU2VlIHRoZVxuICAgIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZSBmb3IgbW9yZSBkZXRhaWxzLlxuXG4gICAgWW91IHNob3VsZCBoYXZlIHJlY2VpdmVkIGEgY29weSBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlXG4gICAgYWxvbmcgd2l0aCBldGhlcmV1bS5qcy4gIElmIG5vdCwgc2VlIDxodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvPi5cbiovXG4vKipcbiAqIEBmaWxlIHByb3BlcnR5LmpzXG4gKiBAYXV0aG9yIEZhYmlhbiBWb2dlbHN0ZWxsZXIgPGZhYmlhbkBmcm96ZW1hbi5kZT5cbiAqIEBhdXRob3IgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiBAZGF0ZSAyMDE1XG4gKi9cblxudmFyIFJlcXVlc3RNYW5hZ2VyID0gcmVxdWlyZSgnLi9yZXF1ZXN0bWFuYWdlcicpO1xuXG52YXIgUHJvcGVydHkgPSBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgIHRoaXMubmFtZSA9IG9wdGlvbnMubmFtZTtcbiAgICB0aGlzLmdldHRlciA9IG9wdGlvbnMuZ2V0dGVyO1xuICAgIHRoaXMuc2V0dGVyID0gb3B0aW9ucy5zZXR0ZXI7XG4gICAgdGhpcy5vdXRwdXRGb3JtYXR0ZXIgPSBvcHRpb25zLm91dHB1dEZvcm1hdHRlcjtcbiAgICB0aGlzLmlucHV0Rm9ybWF0dGVyID0gb3B0aW9ucy5pbnB1dEZvcm1hdHRlcjtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBmb3JtYXQgaW5wdXQgYXJncyBvZiBtZXRob2RcbiAqIFxuICogQG1ldGhvZCBmb3JtYXRJbnB1dFxuICogQHBhcmFtIHtBcnJheX1cbiAqIEByZXR1cm4ge0FycmF5fVxuICovXG5Qcm9wZXJ0eS5wcm90b3R5cGUuZm9ybWF0SW5wdXQgPSBmdW5jdGlvbiAoYXJnKSB7XG4gICAgcmV0dXJuIHRoaXMuaW5wdXRGb3JtYXR0ZXIgPyB0aGlzLmlucHV0Rm9ybWF0dGVyKGFyZykgOiBhcmc7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gZm9ybWF0IG91dHB1dChyZXN1bHQpIG9mIG1ldGhvZFxuICpcbiAqIEBtZXRob2QgZm9ybWF0T3V0cHV0XG4gKiBAcGFyYW0ge09iamVjdH1cbiAqIEByZXR1cm4ge09iamVjdH1cbiAqL1xuUHJvcGVydHkucHJvdG90eXBlLmZvcm1hdE91dHB1dCA9IGZ1bmN0aW9uIChyZXN1bHQpIHtcbiAgICByZXR1cm4gdGhpcy5vdXRwdXRGb3JtYXR0ZXIgJiYgcmVzdWx0ICE9PSBudWxsID8gdGhpcy5vdXRwdXRGb3JtYXR0ZXIocmVzdWx0KSA6IHJlc3VsdDtcbn07XG5cbi8qKlxuICogU2hvdWxkIGF0dGFjaCBmdW5jdGlvbiB0byBtZXRob2RcbiAqIFxuICogQG1ldGhvZCBhdHRhY2hUb09iamVjdFxuICogQHBhcmFtIHtPYmplY3R9XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufVxuICovXG5Qcm9wZXJ0eS5wcm90b3R5cGUuYXR0YWNoVG9PYmplY3QgPSBmdW5jdGlvbiAob2JqKSB7XG4gICAgdmFyIHByb3RvID0ge1xuICAgICAgICBnZXQ6IHRoaXMuZ2V0LmJpbmQodGhpcyksXG4gICAgfTtcblxuICAgIHZhciBuYW1lcyA9IHRoaXMubmFtZS5zcGxpdCgnLicpO1xuICAgIHZhciBuYW1lID0gbmFtZXNbMF07XG4gICAgaWYgKG5hbWVzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgb2JqW25hbWVzWzBdXSA9IG9ialtuYW1lc1swXV0gfHwge307XG4gICAgICAgIG9iaiA9IG9ialtuYW1lc1swXV07XG4gICAgICAgIG5hbWUgPSBuYW1lc1sxXTtcbiAgICB9XG4gICAgXG4gICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KG9iaiwgbmFtZSwgcHJvdG8pO1xuXG4gICAgdmFyIHRvQXN5bmNOYW1lID0gZnVuY3Rpb24gKHByZWZpeCwgbmFtZSkge1xuICAgICAgICByZXR1cm4gcHJlZml4ICsgbmFtZS5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSArIG5hbWUuc2xpY2UoMSk7XG4gICAgfTtcblxuICAgIG9ialt0b0FzeW5jTmFtZSgnZ2V0JywgbmFtZSldID0gdGhpcy5nZXRBc3luYy5iaW5kKHRoaXMpO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBnZXQgdmFsdWUgb2YgdGhlIHByb3BlcnR5XG4gKlxuICogQG1ldGhvZCBnZXRcbiAqIEByZXR1cm4ge09iamVjdH0gdmFsdWUgb2YgdGhlIHByb3BlcnR5XG4gKi9cblByb3BlcnR5LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgcmV0dXJuIHRoaXMuZm9ybWF0T3V0cHV0KFJlcXVlc3RNYW5hZ2VyLmdldEluc3RhbmNlKCkuc2VuZCh7XG4gICAgICAgIG1ldGhvZDogdGhpcy5nZXR0ZXJcbiAgICB9KSk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIGFzeW5jaHJvdW5vdXNseSBnZXQgdmFsdWUgb2YgcHJvcGVydHlcbiAqXG4gKiBAbWV0aG9kIGdldEFzeW5jXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufVxuICovXG5Qcm9wZXJ0eS5wcm90b3R5cGUuZ2V0QXN5bmMgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgUmVxdWVzdE1hbmFnZXIuZ2V0SW5zdGFuY2UoKS5zZW5kQXN5bmMoe1xuICAgICAgICBtZXRob2Q6IHRoaXMuZ2V0dGVyXG4gICAgfSwgZnVuY3Rpb24gKGVyciwgcmVzdWx0KSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICB9XG4gICAgICAgIGNhbGxiYWNrKGVyciwgc2VsZi5mb3JtYXRPdXRwdXQocmVzdWx0KSk7XG4gICAgfSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFByb3BlcnR5O1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBAZmlsZSBxdHN5bmMuanNcbiAqIEBhdXRob3JzOlxuICogICBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqICAgTWFyaWFuIE9hbmNlYSA8bWFyaWFuQGV0aGRldi5jb20+XG4gKiBAZGF0ZSAyMDE0XG4gKi9cblxudmFyIFF0U3luY1Byb3ZpZGVyID0gZnVuY3Rpb24gKCkge1xufTtcblxuUXRTeW5jUHJvdmlkZXIucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbiAocGF5bG9hZCkge1xuICAgIHZhciByZXN1bHQgPSBuYXZpZ2F0b3IucXQuY2FsbE1ldGhvZChKU09OLnN0cmluZ2lmeShwYXlsb2FkKSk7XG4gICAgcmV0dXJuIEpTT04ucGFyc2UocmVzdWx0KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUXRTeW5jUHJvdmlkZXI7XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIFxuICogQGZpbGUgcmVxdWVzdG1hbmFnZXIuanNcbiAqIEBhdXRob3IgSmVmZnJleSBXaWxja2UgPGplZmZAZXRoZGV2LmNvbT5cbiAqIEBhdXRob3IgTWFyZWsgS290ZXdpY3ogPG1hcmVrQGV0aGRldi5jb20+XG4gKiBAYXV0aG9yIE1hcmlhbiBPYW5jZWEgPG1hcmlhbkBldGhkZXYuY29tPlxuICogQGF1dGhvciBGYWJpYW4gVm9nZWxzdGVsbGVyIDxmYWJpYW5AZXRoZGV2LmNvbT5cbiAqIEBhdXRob3IgR2F2IFdvb2QgPGdAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTRcbiAqL1xuXG52YXIgSnNvbnJwYyA9IHJlcXVpcmUoJy4vanNvbnJwYycpO1xudmFyIHV0aWxzID0gcmVxdWlyZSgnLi4vdXRpbHMvdXRpbHMnKTtcbnZhciBjID0gcmVxdWlyZSgnLi4vdXRpbHMvY29uZmlnJyk7XG52YXIgZXJyb3JzID0gcmVxdWlyZSgnLi9lcnJvcnMnKTtcblxuLyoqXG4gKiBJdCdzIHJlc3BvbnNpYmxlIGZvciBwYXNzaW5nIG1lc3NhZ2VzIHRvIHByb3ZpZGVyc1xuICogSXQncyBhbHNvIHJlc3BvbnNpYmxlIGZvciBwb2xsaW5nIHRoZSBldGhlcmV1bSBub2RlIGZvciBpbmNvbWluZyBtZXNzYWdlc1xuICogRGVmYXVsdCBwb2xsIHRpbWVvdXQgaXMgMSBzZWNvbmRcbiAqIFNpbmdsZXRvblxuICovXG52YXIgUmVxdWVzdE1hbmFnZXIgPSBmdW5jdGlvbiAocHJvdmlkZXIpIHtcbiAgICAvLyBzaW5nbGV0b24gcGF0dGVyblxuICAgIGlmIChhcmd1bWVudHMuY2FsbGVlLl9zaW5nbGV0b25JbnN0YW5jZSkge1xuICAgICAgICByZXR1cm4gYXJndW1lbnRzLmNhbGxlZS5fc2luZ2xldG9uSW5zdGFuY2U7XG4gICAgfVxuICAgIGFyZ3VtZW50cy5jYWxsZWUuX3NpbmdsZXRvbkluc3RhbmNlID0gdGhpcztcblxuICAgIHRoaXMucHJvdmlkZXIgPSBwcm92aWRlcjtcbiAgICB0aGlzLnBvbGxzID0gW107XG4gICAgdGhpcy50aW1lb3V0ID0gbnVsbDtcbiAgICB0aGlzLnBvbGwoKTtcbn07XG5cbi8qKlxuICogQHJldHVybiB7UmVxdWVzdE1hbmFnZXJ9IHNpbmdsZXRvblxuICovXG5SZXF1ZXN0TWFuYWdlci5nZXRJbnN0YW5jZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgaW5zdGFuY2UgPSBuZXcgUmVxdWVzdE1hbmFnZXIoKTtcbiAgICByZXR1cm4gaW5zdGFuY2U7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIHN5bmNocm9ub3VzbHkgc2VuZCByZXF1ZXN0XG4gKlxuICogQG1ldGhvZCBzZW5kXG4gKiBAcGFyYW0ge09iamVjdH0gZGF0YVxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5SZXF1ZXN0TWFuYWdlci5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgaWYgKCF0aGlzLnByb3ZpZGVyKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3JzLkludmFsaWRQcm92aWRlcigpKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgdmFyIHBheWxvYWQgPSBKc29ucnBjLmdldEluc3RhbmNlKCkudG9QYXlsb2FkKGRhdGEubWV0aG9kLCBkYXRhLnBhcmFtcyk7XG4gICAgdmFyIHJlc3VsdCA9IHRoaXMucHJvdmlkZXIuc2VuZChwYXlsb2FkKTtcblxuICAgIGlmICghSnNvbnJwYy5nZXRJbnN0YW5jZSgpLmlzVmFsaWRSZXNwb25zZShyZXN1bHQpKSB7XG4gICAgICAgIHRocm93IGVycm9ycy5JbnZhbGlkUmVzcG9uc2UocmVzdWx0KTtcbiAgICB9XG5cbiAgICByZXR1cm4gcmVzdWx0LnJlc3VsdDtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gYXN5bmNocm9ub3VzbHkgc2VuZCByZXF1ZXN0XG4gKlxuICogQG1ldGhvZCBzZW5kQXN5bmNcbiAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFja1xuICovXG5SZXF1ZXN0TWFuYWdlci5wcm90b3R5cGUuc2VuZEFzeW5jID0gZnVuY3Rpb24gKGRhdGEsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCF0aGlzLnByb3ZpZGVyKSB7XG4gICAgICAgIHJldHVybiBjYWxsYmFjayhlcnJvcnMuSW52YWxpZFByb3ZpZGVyKCkpO1xuICAgIH1cblxuICAgIHZhciBwYXlsb2FkID0gSnNvbnJwYy5nZXRJbnN0YW5jZSgpLnRvUGF5bG9hZChkYXRhLm1ldGhvZCwgZGF0YS5wYXJhbXMpO1xuICAgIHRoaXMucHJvdmlkZXIuc2VuZEFzeW5jKHBheWxvYWQsIGZ1bmN0aW9uIChlcnIsIHJlc3VsdCkge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyKTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgaWYgKCFKc29ucnBjLmdldEluc3RhbmNlKCkuaXNWYWxpZFJlc3BvbnNlKHJlc3VsdCkpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnJvcnMuSW52YWxpZFJlc3BvbnNlKHJlc3VsdCkpO1xuICAgICAgICB9XG5cbiAgICAgICAgY2FsbGJhY2sobnVsbCwgcmVzdWx0LnJlc3VsdCk7XG4gICAgfSk7XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gYXN5bmNocm9ub3VzbHkgc2VuZCBiYXRjaCByZXF1ZXN0XG4gKlxuICogQG1ldGhvZCBzZW5kQmF0Y2hcbiAqIEBwYXJhbSB7QXJyYXl9IGJhdGNoIGRhdGFcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrXG4gKi9cblJlcXVlc3RNYW5hZ2VyLnByb3RvdHlwZS5zZW5kQmF0Y2ggPSBmdW5jdGlvbiAoZGF0YSwgY2FsbGJhY2spIHtcbiAgICBpZiAoIXRoaXMucHJvdmlkZXIpIHtcbiAgICAgICAgcmV0dXJuIGNhbGxiYWNrKGVycm9ycy5JbnZhbGlkUHJvdmlkZXIoKSk7XG4gICAgfVxuXG4gICAgdmFyIHBheWxvYWQgPSBKc29ucnBjLmdldEluc3RhbmNlKCkudG9CYXRjaFBheWxvYWQoZGF0YSk7XG5cbiAgICB0aGlzLnByb3ZpZGVyLnNlbmRBc3luYyhwYXlsb2FkLCBmdW5jdGlvbiAoZXJyLCByZXN1bHRzKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIHJldHVybiBjYWxsYmFjayhlcnIpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF1dGlscy5pc0FycmF5KHJlc3VsdHMpKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FsbGJhY2soZXJyb3JzLkludmFsaWRSZXNwb25zZShyZXN1bHRzKSk7XG4gICAgICAgIH1cblxuICAgICAgICBjYWxsYmFjayhlcnIsIHJlc3VsdHMpO1xuICAgIH0pOyBcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gc2V0IHByb3ZpZGVyIG9mIHJlcXVlc3QgbWFuYWdlclxuICpcbiAqIEBtZXRob2Qgc2V0UHJvdmlkZXJcbiAqIEBwYXJhbSB7T2JqZWN0fVxuICovXG5SZXF1ZXN0TWFuYWdlci5wcm90b3R5cGUuc2V0UHJvdmlkZXIgPSBmdW5jdGlvbiAocCkge1xuICAgIHRoaXMucHJvdmlkZXIgPSBwO1xufTtcblxuLypqc2hpbnQgbWF4cGFyYW1zOjQgKi9cblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBzdGFydCBwb2xsaW5nXG4gKlxuICogQG1ldGhvZCBzdGFydFBvbGxpbmdcbiAqIEBwYXJhbSB7T2JqZWN0fSBkYXRhXG4gKiBAcGFyYW0ge051bWJlcn0gcG9sbElkXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFja1xuICogQHBhcmFtIHtGdW5jdGlvbn0gdW5pbnN0YWxsXG4gKlxuICogQHRvZG8gY2xlYW51cCBudW1iZXIgb2YgcGFyYW1zXG4gKi9cblJlcXVlc3RNYW5hZ2VyLnByb3RvdHlwZS5zdGFydFBvbGxpbmcgPSBmdW5jdGlvbiAoZGF0YSwgcG9sbElkLCBjYWxsYmFjaywgdW5pbnN0YWxsKSB7XG4gICAgdGhpcy5wb2xscy5wdXNoKHtkYXRhOiBkYXRhLCBpZDogcG9sbElkLCBjYWxsYmFjazogY2FsbGJhY2ssIHVuaW5zdGFsbDogdW5pbnN0YWxsfSk7XG59O1xuLypqc2hpbnQgbWF4cGFyYW1zOjMgKi9cblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBzdG9wIHBvbGxpbmcgZm9yIGZpbHRlciB3aXRoIGdpdmVuIGlkXG4gKlxuICogQG1ldGhvZCBzdG9wUG9sbGluZ1xuICogQHBhcmFtIHtOdW1iZXJ9IHBvbGxJZFxuICovXG5SZXF1ZXN0TWFuYWdlci5wcm90b3R5cGUuc3RvcFBvbGxpbmcgPSBmdW5jdGlvbiAocG9sbElkKSB7XG4gICAgZm9yICh2YXIgaSA9IHRoaXMucG9sbHMubGVuZ3RoOyBpLS07KSB7XG4gICAgICAgIHZhciBwb2xsID0gdGhpcy5wb2xsc1tpXTtcbiAgICAgICAgaWYgKHBvbGwuaWQgPT09IHBvbGxJZCkge1xuICAgICAgICAgICAgdGhpcy5wb2xscy5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSBjYWxsZWQgdG8gcmVzZXQgcG9sbGluZyBtZWNoYW5pc20gb2YgcmVxdWVzdCBtYW5hZ2VyXG4gKlxuICogQG1ldGhvZCByZXNldFxuICovXG5SZXF1ZXN0TWFuYWdlci5wcm90b3R5cGUucmVzZXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5wb2xscy5mb3JFYWNoKGZ1bmN0aW9uIChwb2xsKSB7XG4gICAgICAgIHBvbGwudW5pbnN0YWxsKHBvbGwuaWQpOyBcbiAgICB9KTtcbiAgICB0aGlzLnBvbGxzID0gW107XG5cbiAgICBpZiAodGhpcy50aW1lb3V0KSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXQpO1xuICAgICAgICB0aGlzLnRpbWVvdXQgPSBudWxsO1xuICAgIH1cbiAgICB0aGlzLnBvbGwoKTtcbn07XG5cbi8qKlxuICogU2hvdWxkIGJlIGNhbGxlZCB0byBwb2xsIGZvciBjaGFuZ2VzIG9uIGZpbHRlciB3aXRoIGdpdmVuIGlkXG4gKlxuICogQG1ldGhvZCBwb2xsXG4gKi9cblJlcXVlc3RNYW5hZ2VyLnByb3RvdHlwZS5wb2xsID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXMudGltZW91dCA9IHNldFRpbWVvdXQodGhpcy5wb2xsLmJpbmQodGhpcyksIGMuRVRIX1BPTExJTkdfVElNRU9VVCk7XG5cbiAgICBpZiAoIXRoaXMucG9sbHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMucHJvdmlkZXIpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihlcnJvcnMuSW52YWxpZFByb3ZpZGVyKCkpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHBheWxvYWQgPSBKc29ucnBjLmdldEluc3RhbmNlKCkudG9CYXRjaFBheWxvYWQodGhpcy5wb2xscy5tYXAoZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgICAgcmV0dXJuIGRhdGEuZGF0YTtcbiAgICB9KSk7XG5cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdGhpcy5wcm92aWRlci5zZW5kQXN5bmMocGF5bG9hZCwgZnVuY3Rpb24gKGVycm9yLCByZXN1bHRzKSB7XG4gICAgICAgIC8vIFRPRE86IGNvbnNvbGUgbG9nP1xuICAgICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAgICAgXG4gICAgICAgIGlmICghdXRpbHMuaXNBcnJheShyZXN1bHRzKSkge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3JzLkludmFsaWRSZXNwb25zZShyZXN1bHRzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJlc3VsdHMubWFwKGZ1bmN0aW9uIChyZXN1bHQsIGluZGV4KSB7XG4gICAgICAgICAgICByZXN1bHQuY2FsbGJhY2sgPSBzZWxmLnBvbGxzW2luZGV4XS5jYWxsYmFjaztcbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0pLmZpbHRlcihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICB2YXIgdmFsaWQgPSBKc29ucnBjLmdldEluc3RhbmNlKCkuaXNWYWxpZFJlc3BvbnNlKHJlc3VsdCk7XG4gICAgICAgICAgICBpZiAoIXZhbGlkKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LmNhbGxiYWNrKGVycm9ycy5JbnZhbGlkUmVzcG9uc2UocmVzdWx0KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdmFsaWQ7XG4gICAgICAgIH0pLmZpbHRlcihmdW5jdGlvbiAocmVzdWx0KSB7XG4gICAgICAgICAgICByZXR1cm4gdXRpbHMuaXNBcnJheShyZXN1bHQucmVzdWx0KSAmJiByZXN1bHQucmVzdWx0Lmxlbmd0aCA+IDA7XG4gICAgICAgIH0pLmZvckVhY2goZnVuY3Rpb24gKHJlc3VsdCkge1xuICAgICAgICAgICAgcmVzdWx0LmNhbGxiYWNrKG51bGwsIHJlc3VsdC5yZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUmVxdWVzdE1hbmFnZXI7XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIEBmaWxlIHNoaC5qc1xuICogQGF1dGhvcnM6XG4gKiAgIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciBNZXRob2QgPSByZXF1aXJlKCcuL21ldGhvZCcpO1xudmFyIGZvcm1hdHRlcnMgPSByZXF1aXJlKCcuL2Zvcm1hdHRlcnMnKTtcblxudmFyIHBvc3QgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAncG9zdCcsIFxuICAgIGNhbGw6ICdzaGhfcG9zdCcsIFxuICAgIHBhcmFtczogMSxcbiAgICBpbnB1dEZvcm1hdHRlcjogW2Zvcm1hdHRlcnMuaW5wdXRQb3N0Rm9ybWF0dGVyXVxufSk7XG5cbnZhciBuZXdJZGVudGl0eSA9IG5ldyBNZXRob2Qoe1xuICAgIG5hbWU6ICduZXdJZGVudGl0eScsXG4gICAgY2FsbDogJ3NoaF9uZXdJZGVudGl0eScsXG4gICAgcGFyYW1zOiAwXG59KTtcblxudmFyIGhhc0lkZW50aXR5ID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2hhc0lkZW50aXR5JyxcbiAgICBjYWxsOiAnc2hoX2hhc0lkZW50aXR5JyxcbiAgICBwYXJhbXM6IDFcbn0pO1xuXG52YXIgbmV3R3JvdXAgPSBuZXcgTWV0aG9kKHtcbiAgICBuYW1lOiAnbmV3R3JvdXAnLFxuICAgIGNhbGw6ICdzaGhfbmV3R3JvdXAnLFxuICAgIHBhcmFtczogMFxufSk7XG5cbnZhciBhZGRUb0dyb3VwID0gbmV3IE1ldGhvZCh7XG4gICAgbmFtZTogJ2FkZFRvR3JvdXAnLFxuICAgIGNhbGw6ICdzaGhfYWRkVG9Hcm91cCcsXG4gICAgcGFyYW1zOiAwXG59KTtcblxudmFyIG1ldGhvZHMgPSBbXG4gICAgcG9zdCxcbiAgICBuZXdJZGVudGl0eSxcbiAgICBoYXNJZGVudGl0eSxcbiAgICBuZXdHcm91cCxcbiAgICBhZGRUb0dyb3VwXG5dO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBtZXRob2RzOiBtZXRob2RzXG59O1xuXG4iLCIvKlxuICAgIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIGV0aGVyZXVtLmpzLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZnJlZSBzb2Z0d2FyZTogeW91IGNhbiByZWRpc3RyaWJ1dGUgaXQgYW5kL29yIG1vZGlmeVxuICAgIGl0IHVuZGVyIHRoZSB0ZXJtcyBvZiB0aGUgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGFzIHB1Ymxpc2hlZCBieVxuICAgIHRoZSBGcmVlIFNvZnR3YXJlIEZvdW5kYXRpb24sIGVpdGhlciB2ZXJzaW9uIDMgb2YgdGhlIExpY2Vuc2UsIG9yXG4gICAgKGF0IHlvdXIgb3B0aW9uKSBhbnkgbGF0ZXIgdmVyc2lvbi5cblxuICAgIGV0aGVyZXVtLmpzIGlzIGRpc3RyaWJ1dGVkIGluIHRoZSBob3BlIHRoYXQgaXQgd2lsbCBiZSB1c2VmdWwsXG4gICAgYnV0IFdJVEhPVVQgQU5ZIFdBUlJBTlRZOyB3aXRob3V0IGV2ZW4gdGhlIGltcGxpZWQgd2FycmFudHkgb2ZcbiAgICBNRVJDSEFOVEFCSUxJVFkgb3IgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UuICBTZWUgdGhlXG4gICAgR05VIExlc3NlciBHZW5lcmFsIFB1YmxpYyBMaWNlbnNlIGZvciBtb3JlIGRldGFpbHMuXG5cbiAgICBZb3Ugc2hvdWxkIGhhdmUgcmVjZWl2ZWQgYSBjb3B5IG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2VcbiAgICBhbG9uZyB3aXRoIGV0aGVyZXVtLmpzLiAgSWYgbm90LCBzZWUgPGh0dHA6Ly93d3cuZ251Lm9yZy9saWNlbnNlcy8+LlxuKi9cbi8qKiBcbiAqIEBmaWxlIHRyYW5zZmVyLmpzXG4gKiBAYXV0aG9yIE1hcmVrIEtvdGV3aWN6IDxtYXJla0BldGhkZXYuY29tPlxuICogQGRhdGUgMjAxNVxuICovXG5cbnZhciB3ZWIzID0gcmVxdWlyZSgnLi4vd2ViMycpO1xudmFyIElDQVAgPSByZXF1aXJlKCcuL2ljYXAnKTtcbnZhciBuYW1lcmVnID0gcmVxdWlyZSgnLi9uYW1lcmVnJyk7XG52YXIgY29udHJhY3QgPSByZXF1aXJlKCcuL2NvbnRyYWN0Jyk7XG5cbi8qKlxuICogU2hvdWxkIGJlIHVzZWQgdG8gbWFrZSBJQ0FQIHRyYW5zZmVyXG4gKlxuICogQG1ldGhvZCB0cmFuc2ZlclxuICogQHBhcmFtIHtTdHJpbmd9IGliYW4gbnVtYmVyXG4gKiBAcGFyYW0ge1N0cmluZ30gZnJvbSAoYWRkcmVzcylcbiAqIEBwYXJhbSB7VmFsdWV9IHZhbHVlIHRvIGJlIHRyYW5mZXJlZFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2ssIGNhbGxiYWNrXG4gKi9cbnZhciB0cmFuc2ZlciA9IGZ1bmN0aW9uIChmcm9tLCBpYmFuLCB2YWx1ZSwgY2FsbGJhY2spIHtcbiAgICB2YXIgaWNhcCA9IG5ldyBJQ0FQKGliYW4pOyBcbiAgICBpZiAoIWljYXAuaXNWYWxpZCgpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignaW52YWxpZCBpYmFuIGFkZHJlc3MnKTtcbiAgICB9XG5cbiAgICBpZiAoaWNhcC5pc0RpcmVjdCgpKSB7XG4gICAgICAgIHJldHVybiB0cmFuc2ZlclRvQWRkcmVzcyhmcm9tLCBpY2FwLmFkZHJlc3MoKSwgdmFsdWUsIGNhbGxiYWNrKTtcbiAgICB9XG4gICAgXG4gICAgaWYgKCFjYWxsYmFjaykge1xuICAgICAgICB2YXIgYWRkcmVzcyA9IG5hbWVyZWcuYWRkcihpY2FwLmluc3RpdHV0aW9uKCkpO1xuICAgICAgICByZXR1cm4gZGVwb3NpdChmcm9tLCBhZGRyZXNzLCB2YWx1ZSwgaWNhcC5jbGllbnQoKSk7XG4gICAgfVxuXG4gICAgbmFtZXJlZy5hZGRyKGljYXAuaW5zaXR1dGlvbigpLCBmdW5jdGlvbiAoZXJyLCBhZGRyZXNzKSB7XG4gICAgICAgIHJldHVybiBkZXBvc2l0KGZyb20sIGFkZHJlc3MsIHZhbHVlLCBpY2FwLmNsaWVudCgpLCBjYWxsYmFjayk7XG4gICAgfSk7XG4gICAgXG59O1xuXG4vKipcbiAqIFNob3VsZCBiZSB1c2VkIHRvIHRyYW5zZmVyIGZ1bmRzIHRvIGNlcnRhaW4gYWRkcmVzc1xuICpcbiAqIEBtZXRob2QgdHJhbnNmZXJUb0FkZHJlc3NcbiAqIEBwYXJhbSB7U3RyaW5nfSBhZGRyZXNzXG4gKiBAcGFyYW0ge1N0cmluZ30gZnJvbSAoYWRkcmVzcylcbiAqIEBwYXJhbSB7VmFsdWV9IHZhbHVlIHRvIGJlIHRyYW5mZXJlZFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2ssIGNhbGxiYWNrXG4gKi9cbnZhciB0cmFuc2ZlclRvQWRkcmVzcyA9IGZ1bmN0aW9uIChmcm9tLCBhZGRyZXNzLCB2YWx1ZSwgY2FsbGJhY2spIHtcbiAgICByZXR1cm4gd2ViMy5ldGguc2VuZFRyYW5zYWN0aW9uKHtcbiAgICAgICAgYWRkcmVzczogYWRkcmVzcyxcbiAgICAgICAgZnJvbTogZnJvbSxcbiAgICAgICAgdmFsdWU6IHZhbHVlXG4gICAgfSwgY2FsbGJhY2spO1xufTtcblxuLyoqXG4gKiBTaG91bGQgYmUgdXNlZCB0byBkZXBvc2l0IGZ1bmRzIHRvIGdlbmVyaWMgRXhjaGFuZ2UgY29udHJhY3QgKG11c3QgaW1wbGVtZW50IGRlcG9zaXQoYnl0ZXMzMikgbWV0aG9kISlcbiAqXG4gKiBAbWV0aG9kIGRlcG9zaXRcbiAqIEBwYXJhbSB7U3RyaW5nfSBhZGRyZXNzXG4gKiBAcGFyYW0ge1N0cmluZ30gZnJvbSAoYWRkcmVzcylcbiAqIEBwYXJhbSB7VmFsdWV9IHZhbHVlIHRvIGJlIHRyYW5mZXJlZFxuICogQHBhcmFtIHtTdHJpbmd9IGNsaWVudCB1bmlxdWUgaWRlbnRpZmllclxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2ssIGNhbGxiYWNrXG4gKi9cbnZhciBkZXBvc2l0ID0gZnVuY3Rpb24gKGZyb20sIGFkZHJlc3MsIHZhbHVlLCBjbGllbnQsIGNhbGxiYWNrKSB7XG4gICAgdmFyIGFiaSA9IFt7XCJjb25zdGFudFwiOmZhbHNlLFwiaW5wdXRzXCI6W3tcIm5hbWVcIjpcIm5hbWVcIixcInR5cGVcIjpcImJ5dGVzMzJcIn1dLFwibmFtZVwiOlwiZGVwb3NpdFwiLFwib3V0cHV0c1wiOltdLFwidHlwZVwiOlwiZnVuY3Rpb25cIn1dO1xuICAgIHJldHVybiBjb250cmFjdChhYmkpLmF0KGFkZHJlc3MpLmRlcG9zaXQoY2xpZW50LCB7XG4gICAgICAgIGZyb206IGZyb20sXG4gICAgICAgIHZhbHVlOiB2YWx1ZVxuICAgIH0sIGNhbGxiYWNrKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gdHJhbnNmZXI7XG5cbiIsIi8qXG4gICAgVGhpcyBmaWxlIGlzIHBhcnQgb2YgZXRoZXJldW0uanMuXG5cbiAgICBldGhlcmV1bS5qcyBpcyBmcmVlIHNvZnR3YXJlOiB5b3UgY2FuIHJlZGlzdHJpYnV0ZSBpdCBhbmQvb3IgbW9kaWZ5XG4gICAgaXQgdW5kZXIgdGhlIHRlcm1zIG9mIHRoZSBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgYXMgcHVibGlzaGVkIGJ5XG4gICAgdGhlIEZyZWUgU29mdHdhcmUgRm91bmRhdGlvbiwgZWl0aGVyIHZlcnNpb24gMyBvZiB0aGUgTGljZW5zZSwgb3JcbiAgICAoYXQgeW91ciBvcHRpb24pIGFueSBsYXRlciB2ZXJzaW9uLlxuXG4gICAgZXRoZXJldW0uanMgaXMgZGlzdHJpYnV0ZWQgaW4gdGhlIGhvcGUgdGhhdCBpdCB3aWxsIGJlIHVzZWZ1bCxcbiAgICBidXQgV0lUSE9VVCBBTlkgV0FSUkFOVFk7IHdpdGhvdXQgZXZlbiB0aGUgaW1wbGllZCB3YXJyYW50eSBvZlxuICAgIE1FUkNIQU5UQUJJTElUWSBvciBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRS4gIFNlZSB0aGVcbiAgICBHTlUgTGVzc2VyIEdlbmVyYWwgUHVibGljIExpY2Vuc2UgZm9yIG1vcmUgZGV0YWlscy5cblxuICAgIFlvdSBzaG91bGQgaGF2ZSByZWNlaXZlZCBhIGNvcHkgb2YgdGhlIEdOVSBMZXNzZXIgR2VuZXJhbCBQdWJsaWMgTGljZW5zZVxuICAgIGFsb25nIHdpdGggZXRoZXJldW0uanMuICBJZiBub3QsIHNlZSA8aHR0cDovL3d3dy5nbnUub3JnL2xpY2Vuc2VzLz4uXG4qL1xuLyoqIEBmaWxlIHdhdGNoZXMuanNcbiAqIEBhdXRob3JzOlxuICogICBNYXJlayBLb3Rld2ljeiA8bWFyZWtAZXRoZGV2LmNvbT5cbiAqIEBkYXRlIDIwMTVcbiAqL1xuXG52YXIgTWV0aG9kID0gcmVxdWlyZSgnLi9tZXRob2QnKTtcblxuLy8vIEByZXR1cm5zIGFuIGFycmF5IG9mIG9iamVjdHMgZGVzY3JpYmluZyB3ZWIzLmV0aC5maWx0ZXIgYXBpIG1ldGhvZHNcbnZhciBldGggPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG5ld0ZpbHRlckNhbGwgPSBmdW5jdGlvbiAoYXJncykge1xuICAgICAgICB2YXIgdHlwZSA9IGFyZ3NbMF07XG5cbiAgICAgICAgc3dpdGNoKHR5cGUpIHtcbiAgICAgICAgICAgIGNhc2UgJ2xhdGVzdCc6XG4gICAgICAgICAgICAgICAgYXJncy5wb3AoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnBhcmFtcyA9IDA7XG4gICAgICAgICAgICAgICAgcmV0dXJuICdldGhfbmV3QmxvY2tGaWx0ZXInO1xuICAgICAgICAgICAgY2FzZSAncGVuZGluZyc6XG4gICAgICAgICAgICAgICAgYXJncy5wb3AoKTtcbiAgICAgICAgICAgICAgICB0aGlzLnBhcmFtcyA9IDA7XG4gICAgICAgICAgICAgICAgcmV0dXJuICdldGhfbmV3UGVuZGluZ1RyYW5zYWN0aW9uRmlsdGVyJztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgcmV0dXJuICdldGhfbmV3RmlsdGVyJztcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICB2YXIgbmV3RmlsdGVyID0gbmV3IE1ldGhvZCh7XG4gICAgICAgIG5hbWU6ICduZXdGaWx0ZXInLFxuICAgICAgICBjYWxsOiBuZXdGaWx0ZXJDYWxsLFxuICAgICAgICBwYXJhbXM6IDFcbiAgICB9KTtcblxuICAgIHZhciB1bmluc3RhbGxGaWx0ZXIgPSBuZXcgTWV0aG9kKHtcbiAgICAgICAgbmFtZTogJ3VuaW5zdGFsbEZpbHRlcicsXG4gICAgICAgIGNhbGw6ICdldGhfdW5pbnN0YWxsRmlsdGVyJyxcbiAgICAgICAgcGFyYW1zOiAxXG4gICAgfSk7XG5cbiAgICB2YXIgZ2V0TG9ncyA9IG5ldyBNZXRob2Qoe1xuICAgICAgICBuYW1lOiAnZ2V0TG9ncycsXG4gICAgICAgIGNhbGw6ICdldGhfZ2V0RmlsdGVyTG9ncycsXG4gICAgICAgIHBhcmFtczogMVxuICAgIH0pO1xuXG4gICAgdmFyIHBvbGwgPSBuZXcgTWV0aG9kKHtcbiAgICAgICAgbmFtZTogJ3BvbGwnLFxuICAgICAgICBjYWxsOiAnZXRoX2dldEZpbHRlckNoYW5nZXMnLFxuICAgICAgICBwYXJhbXM6IDFcbiAgICB9KTtcblxuICAgIHJldHVybiBbXG4gICAgICAgIG5ld0ZpbHRlcixcbiAgICAgICAgdW5pbnN0YWxsRmlsdGVyLFxuICAgICAgICBnZXRMb2dzLFxuICAgICAgICBwb2xsXG4gICAgXTtcbn07XG5cbi8vLyBAcmV0dXJucyBhbiBhcnJheSBvZiBvYmplY3RzIGRlc2NyaWJpbmcgd2ViMy5zaGgud2F0Y2ggYXBpIG1ldGhvZHNcbnZhciBzaGggPSBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIG5ld0ZpbHRlciA9IG5ldyBNZXRob2Qoe1xuICAgICAgICBuYW1lOiAnbmV3RmlsdGVyJyxcbiAgICAgICAgY2FsbDogJ3NoaF9uZXdGaWx0ZXInLFxuICAgICAgICBwYXJhbXM6IDFcbiAgICB9KTtcblxuICAgIHZhciB1bmluc3RhbGxGaWx0ZXIgPSBuZXcgTWV0aG9kKHtcbiAgICAgICAgbmFtZTogJ3VuaW5zdGFsbEZpbHRlcicsXG4gICAgICAgIGNhbGw6ICdzaGhfdW5pbnN0YWxsRmlsdGVyJyxcbiAgICAgICAgcGFyYW1zOiAxXG4gICAgfSk7XG5cbiAgICB2YXIgZ2V0TG9ncyA9IG5ldyBNZXRob2Qoe1xuICAgICAgICBuYW1lOiAnZ2V0TG9ncycsXG4gICAgICAgIGNhbGw6ICdzaGhfZ2V0TWVzc2FnZXMnLFxuICAgICAgICBwYXJhbXM6IDFcbiAgICB9KTtcblxuICAgIHZhciBwb2xsID0gbmV3IE1ldGhvZCh7XG4gICAgICAgIG5hbWU6ICdwb2xsJyxcbiAgICAgICAgY2FsbDogJ3NoaF9nZXRGaWx0ZXJDaGFuZ2VzJyxcbiAgICAgICAgcGFyYW1zOiAxXG4gICAgfSk7XG5cbiAgICByZXR1cm4gW1xuICAgICAgICBuZXdGaWx0ZXIsXG4gICAgICAgIHVuaW5zdGFsbEZpbHRlcixcbiAgICAgICAgZ2V0TG9ncyxcbiAgICAgICAgcG9sbFxuICAgIF07XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgICBldGg6IGV0aCxcbiAgICBzaGg6IHNoaFxufTtcblxuIixudWxsLCI7KGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XG5cdGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gXCJvYmplY3RcIikge1xuXHRcdC8vIENvbW1vbkpTXG5cdFx0bW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzID0gZmFjdG9yeSgpO1xuXHR9XG5cdGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAmJiBkZWZpbmUuYW1kKSB7XG5cdFx0Ly8gQU1EXG5cdFx0ZGVmaW5lKFtdLCBmYWN0b3J5KTtcblx0fVxuXHRlbHNlIHtcblx0XHQvLyBHbG9iYWwgKGJyb3dzZXIpXG5cdFx0cm9vdC5DcnlwdG9KUyA9IGZhY3RvcnkoKTtcblx0fVxufSh0aGlzLCBmdW5jdGlvbiAoKSB7XG5cblx0LyoqXG5cdCAqIENyeXB0b0pTIGNvcmUgY29tcG9uZW50cy5cblx0ICovXG5cdHZhciBDcnlwdG9KUyA9IENyeXB0b0pTIHx8IChmdW5jdGlvbiAoTWF0aCwgdW5kZWZpbmVkKSB7XG5cdCAgICAvKipcblx0ICAgICAqIENyeXB0b0pTIG5hbWVzcGFjZS5cblx0ICAgICAqL1xuXHQgICAgdmFyIEMgPSB7fTtcblxuXHQgICAgLyoqXG5cdCAgICAgKiBMaWJyYXJ5IG5hbWVzcGFjZS5cblx0ICAgICAqL1xuXHQgICAgdmFyIENfbGliID0gQy5saWIgPSB7fTtcblxuXHQgICAgLyoqXG5cdCAgICAgKiBCYXNlIG9iamVjdCBmb3IgcHJvdG90eXBhbCBpbmhlcml0YW5jZS5cblx0ICAgICAqL1xuXHQgICAgdmFyIEJhc2UgPSBDX2xpYi5CYXNlID0gKGZ1bmN0aW9uICgpIHtcblx0ICAgICAgICBmdW5jdGlvbiBGKCkge31cblxuXHQgICAgICAgIHJldHVybiB7XG5cdCAgICAgICAgICAgIC8qKlxuXHQgICAgICAgICAgICAgKiBDcmVhdGVzIGEgbmV3IG9iamVjdCB0aGF0IGluaGVyaXRzIGZyb20gdGhpcyBvYmplY3QuXG5cdCAgICAgICAgICAgICAqXG5cdCAgICAgICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBvdmVycmlkZXMgUHJvcGVydGllcyB0byBjb3B5IGludG8gdGhlIG5ldyBvYmplY3QuXG5cdCAgICAgICAgICAgICAqXG5cdCAgICAgICAgICAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIG5ldyBvYmplY3QuXG5cdCAgICAgICAgICAgICAqXG5cdCAgICAgICAgICAgICAqIEBzdGF0aWNcblx0ICAgICAgICAgICAgICpcblx0ICAgICAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgICAgICpcblx0ICAgICAgICAgICAgICogICAgIHZhciBNeVR5cGUgPSBDcnlwdG9KUy5saWIuQmFzZS5leHRlbmQoe1xuXHQgICAgICAgICAgICAgKiAgICAgICAgIGZpZWxkOiAndmFsdWUnLFxuXHQgICAgICAgICAgICAgKlxuXHQgICAgICAgICAgICAgKiAgICAgICAgIG1ldGhvZDogZnVuY3Rpb24gKCkge1xuXHQgICAgICAgICAgICAgKiAgICAgICAgIH1cblx0ICAgICAgICAgICAgICogICAgIH0pO1xuXHQgICAgICAgICAgICAgKi9cblx0ICAgICAgICAgICAgZXh0ZW5kOiBmdW5jdGlvbiAob3ZlcnJpZGVzKSB7XG5cdCAgICAgICAgICAgICAgICAvLyBTcGF3blxuXHQgICAgICAgICAgICAgICAgRi5wcm90b3R5cGUgPSB0aGlzO1xuXHQgICAgICAgICAgICAgICAgdmFyIHN1YnR5cGUgPSBuZXcgRigpO1xuXG5cdCAgICAgICAgICAgICAgICAvLyBBdWdtZW50XG5cdCAgICAgICAgICAgICAgICBpZiAob3ZlcnJpZGVzKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgc3VidHlwZS5taXhJbihvdmVycmlkZXMpO1xuXHQgICAgICAgICAgICAgICAgfVxuXG5cdCAgICAgICAgICAgICAgICAvLyBDcmVhdGUgZGVmYXVsdCBpbml0aWFsaXplclxuXHQgICAgICAgICAgICAgICAgaWYgKCFzdWJ0eXBlLmhhc093blByb3BlcnR5KCdpbml0JykpIHtcblx0ICAgICAgICAgICAgICAgICAgICBzdWJ0eXBlLmluaXQgPSBmdW5jdGlvbiAoKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgICAgIHN1YnR5cGUuJHN1cGVyLmluaXQuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0ICAgICAgICAgICAgICAgICAgICB9O1xuXHQgICAgICAgICAgICAgICAgfVxuXG5cdCAgICAgICAgICAgICAgICAvLyBJbml0aWFsaXplcidzIHByb3RvdHlwZSBpcyB0aGUgc3VidHlwZSBvYmplY3Rcblx0ICAgICAgICAgICAgICAgIHN1YnR5cGUuaW5pdC5wcm90b3R5cGUgPSBzdWJ0eXBlO1xuXG5cdCAgICAgICAgICAgICAgICAvLyBSZWZlcmVuY2Ugc3VwZXJ0eXBlXG5cdCAgICAgICAgICAgICAgICBzdWJ0eXBlLiRzdXBlciA9IHRoaXM7XG5cblx0ICAgICAgICAgICAgICAgIHJldHVybiBzdWJ0eXBlO1xuXHQgICAgICAgICAgICB9LFxuXG5cdCAgICAgICAgICAgIC8qKlxuXHQgICAgICAgICAgICAgKiBFeHRlbmRzIHRoaXMgb2JqZWN0IGFuZCBydW5zIHRoZSBpbml0IG1ldGhvZC5cblx0ICAgICAgICAgICAgICogQXJndW1lbnRzIHRvIGNyZWF0ZSgpIHdpbGwgYmUgcGFzc2VkIHRvIGluaXQoKS5cblx0ICAgICAgICAgICAgICpcblx0ICAgICAgICAgICAgICogQHJldHVybiB7T2JqZWN0fSBUaGUgbmV3IG9iamVjdC5cblx0ICAgICAgICAgICAgICpcblx0ICAgICAgICAgICAgICogQHN0YXRpY1xuXHQgICAgICAgICAgICAgKlxuXHQgICAgICAgICAgICAgKiBAZXhhbXBsZVxuXHQgICAgICAgICAgICAgKlxuXHQgICAgICAgICAgICAgKiAgICAgdmFyIGluc3RhbmNlID0gTXlUeXBlLmNyZWF0ZSgpO1xuXHQgICAgICAgICAgICAgKi9cblx0ICAgICAgICAgICAgY3JlYXRlOiBmdW5jdGlvbiAoKSB7XG5cdCAgICAgICAgICAgICAgICB2YXIgaW5zdGFuY2UgPSB0aGlzLmV4dGVuZCgpO1xuXHQgICAgICAgICAgICAgICAgaW5zdGFuY2UuaW5pdC5hcHBseShpbnN0YW5jZSwgYXJndW1lbnRzKTtcblxuXHQgICAgICAgICAgICAgICAgcmV0dXJuIGluc3RhbmNlO1xuXHQgICAgICAgICAgICB9LFxuXG5cdCAgICAgICAgICAgIC8qKlxuXHQgICAgICAgICAgICAgKiBJbml0aWFsaXplcyBhIG5ld2x5IGNyZWF0ZWQgb2JqZWN0LlxuXHQgICAgICAgICAgICAgKiBPdmVycmlkZSB0aGlzIG1ldGhvZCB0byBhZGQgc29tZSBsb2dpYyB3aGVuIHlvdXIgb2JqZWN0cyBhcmUgY3JlYXRlZC5cblx0ICAgICAgICAgICAgICpcblx0ICAgICAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgICAgICpcblx0ICAgICAgICAgICAgICogICAgIHZhciBNeVR5cGUgPSBDcnlwdG9KUy5saWIuQmFzZS5leHRlbmQoe1xuXHQgICAgICAgICAgICAgKiAgICAgICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcblx0ICAgICAgICAgICAgICogICAgICAgICAgICAgLy8gLi4uXG5cdCAgICAgICAgICAgICAqICAgICAgICAgfVxuXHQgICAgICAgICAgICAgKiAgICAgfSk7XG5cdCAgICAgICAgICAgICAqL1xuXHQgICAgICAgICAgICBpbml0OiBmdW5jdGlvbiAoKSB7XG5cdCAgICAgICAgICAgIH0sXG5cblx0ICAgICAgICAgICAgLyoqXG5cdCAgICAgICAgICAgICAqIENvcGllcyBwcm9wZXJ0aWVzIGludG8gdGhpcyBvYmplY3QuXG5cdCAgICAgICAgICAgICAqXG5cdCAgICAgICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwcm9wZXJ0aWVzIFRoZSBwcm9wZXJ0aWVzIHRvIG1peCBpbi5cblx0ICAgICAgICAgICAgICpcblx0ICAgICAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgICAgICpcblx0ICAgICAgICAgICAgICogICAgIE15VHlwZS5taXhJbih7XG5cdCAgICAgICAgICAgICAqICAgICAgICAgZmllbGQ6ICd2YWx1ZSdcblx0ICAgICAgICAgICAgICogICAgIH0pO1xuXHQgICAgICAgICAgICAgKi9cblx0ICAgICAgICAgICAgbWl4SW46IGZ1bmN0aW9uIChwcm9wZXJ0aWVzKSB7XG5cdCAgICAgICAgICAgICAgICBmb3IgKHZhciBwcm9wZXJ0eU5hbWUgaW4gcHJvcGVydGllcykge1xuXHQgICAgICAgICAgICAgICAgICAgIGlmIChwcm9wZXJ0aWVzLmhhc093blByb3BlcnR5KHByb3BlcnR5TmFtZSkpIHtcblx0ICAgICAgICAgICAgICAgICAgICAgICAgdGhpc1twcm9wZXJ0eU5hbWVdID0gcHJvcGVydGllc1twcm9wZXJ0eU5hbWVdO1xuXHQgICAgICAgICAgICAgICAgICAgIH1cblx0ICAgICAgICAgICAgICAgIH1cblxuXHQgICAgICAgICAgICAgICAgLy8gSUUgd29uJ3QgY29weSB0b1N0cmluZyB1c2luZyB0aGUgbG9vcCBhYm92ZVxuXHQgICAgICAgICAgICAgICAgaWYgKHByb3BlcnRpZXMuaGFzT3duUHJvcGVydHkoJ3RvU3RyaW5nJykpIHtcblx0ICAgICAgICAgICAgICAgICAgICB0aGlzLnRvU3RyaW5nID0gcHJvcGVydGllcy50b1N0cmluZztcblx0ICAgICAgICAgICAgICAgIH1cblx0ICAgICAgICAgICAgfSxcblxuXHQgICAgICAgICAgICAvKipcblx0ICAgICAgICAgICAgICogQ3JlYXRlcyBhIGNvcHkgb2YgdGhpcyBvYmplY3QuXG5cdCAgICAgICAgICAgICAqXG5cdCAgICAgICAgICAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIGNsb25lLlxuXHQgICAgICAgICAgICAgKlxuXHQgICAgICAgICAgICAgKiBAZXhhbXBsZVxuXHQgICAgICAgICAgICAgKlxuXHQgICAgICAgICAgICAgKiAgICAgdmFyIGNsb25lID0gaW5zdGFuY2UuY2xvbmUoKTtcblx0ICAgICAgICAgICAgICovXG5cdCAgICAgICAgICAgIGNsb25lOiBmdW5jdGlvbiAoKSB7XG5cdCAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5pbml0LnByb3RvdHlwZS5leHRlbmQodGhpcyk7XG5cdCAgICAgICAgICAgIH1cblx0ICAgICAgICB9O1xuXHQgICAgfSgpKTtcblxuXHQgICAgLyoqXG5cdCAgICAgKiBBbiBhcnJheSBvZiAzMi1iaXQgd29yZHMuXG5cdCAgICAgKlxuXHQgICAgICogQHByb3BlcnR5IHtBcnJheX0gd29yZHMgVGhlIGFycmF5IG9mIDMyLWJpdCB3b3Jkcy5cblx0ICAgICAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBzaWdCeXRlcyBUaGUgbnVtYmVyIG9mIHNpZ25pZmljYW50IGJ5dGVzIGluIHRoaXMgd29yZCBhcnJheS5cblx0ICAgICAqL1xuXHQgICAgdmFyIFdvcmRBcnJheSA9IENfbGliLldvcmRBcnJheSA9IEJhc2UuZXh0ZW5kKHtcblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBJbml0aWFsaXplcyBhIG5ld2x5IGNyZWF0ZWQgd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBwYXJhbSB7QXJyYXl9IHdvcmRzIChPcHRpb25hbCkgQW4gYXJyYXkgb2YgMzItYml0IHdvcmRzLlxuXHQgICAgICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzaWdCeXRlcyAoT3B0aW9uYWwpIFRoZSBudW1iZXIgb2Ygc2lnbmlmaWNhbnQgYnl0ZXMgaW4gdGhlIHdvcmRzLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgd29yZEFycmF5ID0gQ3J5cHRvSlMubGliLldvcmRBcnJheS5jcmVhdGUoKTtcblx0ICAgICAgICAgKiAgICAgdmFyIHdvcmRBcnJheSA9IENyeXB0b0pTLmxpYi5Xb3JkQXJyYXkuY3JlYXRlKFsweDAwMDEwMjAzLCAweDA0MDUwNjA3XSk7XG5cdCAgICAgICAgICogICAgIHZhciB3b3JkQXJyYXkgPSBDcnlwdG9KUy5saWIuV29yZEFycmF5LmNyZWF0ZShbMHgwMDAxMDIwMywgMHgwNDA1MDYwN10sIDYpO1xuXHQgICAgICAgICAqL1xuXHQgICAgICAgIGluaXQ6IGZ1bmN0aW9uICh3b3Jkcywgc2lnQnl0ZXMpIHtcblx0ICAgICAgICAgICAgd29yZHMgPSB0aGlzLndvcmRzID0gd29yZHMgfHwgW107XG5cblx0ICAgICAgICAgICAgaWYgKHNpZ0J5dGVzICE9IHVuZGVmaW5lZCkge1xuXHQgICAgICAgICAgICAgICAgdGhpcy5zaWdCeXRlcyA9IHNpZ0J5dGVzO1xuXHQgICAgICAgICAgICB9IGVsc2Uge1xuXHQgICAgICAgICAgICAgICAgdGhpcy5zaWdCeXRlcyA9IHdvcmRzLmxlbmd0aCAqIDQ7XG5cdCAgICAgICAgICAgIH1cblx0ICAgICAgICB9LFxuXG5cdCAgICAgICAgLyoqXG5cdCAgICAgICAgICogQ29udmVydHMgdGhpcyB3b3JkIGFycmF5IHRvIGEgc3RyaW5nLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHBhcmFtIHtFbmNvZGVyfSBlbmNvZGVyIChPcHRpb25hbCkgVGhlIGVuY29kaW5nIHN0cmF0ZWd5IHRvIHVzZS4gRGVmYXVsdDogQ3J5cHRvSlMuZW5jLkhleFxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHJldHVybiB7c3RyaW5nfSBUaGUgc3RyaW5naWZpZWQgd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgdmFyIHN0cmluZyA9IHdvcmRBcnJheSArICcnO1xuXHQgICAgICAgICAqICAgICB2YXIgc3RyaW5nID0gd29yZEFycmF5LnRvU3RyaW5nKCk7XG5cdCAgICAgICAgICogICAgIHZhciBzdHJpbmcgPSB3b3JkQXJyYXkudG9TdHJpbmcoQ3J5cHRvSlMuZW5jLlV0ZjgpO1xuXHQgICAgICAgICAqL1xuXHQgICAgICAgIHRvU3RyaW5nOiBmdW5jdGlvbiAoZW5jb2Rlcikge1xuXHQgICAgICAgICAgICByZXR1cm4gKGVuY29kZXIgfHwgSGV4KS5zdHJpbmdpZnkodGhpcyk7XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIENvbmNhdGVuYXRlcyBhIHdvcmQgYXJyYXkgdG8gdGhpcyB3b3JkIGFycmF5LlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHBhcmFtIHtXb3JkQXJyYXl9IHdvcmRBcnJheSBUaGUgd29yZCBhcnJheSB0byBhcHBlbmQuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcmV0dXJuIHtXb3JkQXJyYXl9IFRoaXMgd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgd29yZEFycmF5MS5jb25jYXQod29yZEFycmF5Mik7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgY29uY2F0OiBmdW5jdGlvbiAod29yZEFycmF5KSB7XG5cdCAgICAgICAgICAgIC8vIFNob3J0Y3V0c1xuXHQgICAgICAgICAgICB2YXIgdGhpc1dvcmRzID0gdGhpcy53b3Jkcztcblx0ICAgICAgICAgICAgdmFyIHRoYXRXb3JkcyA9IHdvcmRBcnJheS53b3Jkcztcblx0ICAgICAgICAgICAgdmFyIHRoaXNTaWdCeXRlcyA9IHRoaXMuc2lnQnl0ZXM7XG5cdCAgICAgICAgICAgIHZhciB0aGF0U2lnQnl0ZXMgPSB3b3JkQXJyYXkuc2lnQnl0ZXM7XG5cblx0ICAgICAgICAgICAgLy8gQ2xhbXAgZXhjZXNzIGJpdHNcblx0ICAgICAgICAgICAgdGhpcy5jbGFtcCgpO1xuXG5cdCAgICAgICAgICAgIC8vIENvbmNhdFxuXHQgICAgICAgICAgICBpZiAodGhpc1NpZ0J5dGVzICUgNCkge1xuXHQgICAgICAgICAgICAgICAgLy8gQ29weSBvbmUgYnl0ZSBhdCBhIHRpbWVcblx0ICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhhdFNpZ0J5dGVzOyBpKyspIHtcblx0ICAgICAgICAgICAgICAgICAgICB2YXIgdGhhdEJ5dGUgPSAodGhhdFdvcmRzW2kgPj4+IDJdID4+PiAoMjQgLSAoaSAlIDQpICogOCkpICYgMHhmZjtcblx0ICAgICAgICAgICAgICAgICAgICB0aGlzV29yZHNbKHRoaXNTaWdCeXRlcyArIGkpID4+PiAyXSB8PSB0aGF0Qnl0ZSA8PCAoMjQgLSAoKHRoaXNTaWdCeXRlcyArIGkpICUgNCkgKiA4KTtcblx0ICAgICAgICAgICAgICAgIH1cblx0ICAgICAgICAgICAgfSBlbHNlIHtcblx0ICAgICAgICAgICAgICAgIC8vIENvcHkgb25lIHdvcmQgYXQgYSB0aW1lXG5cdCAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoYXRTaWdCeXRlczsgaSArPSA0KSB7XG5cdCAgICAgICAgICAgICAgICAgICAgdGhpc1dvcmRzWyh0aGlzU2lnQnl0ZXMgKyBpKSA+Pj4gMl0gPSB0aGF0V29yZHNbaSA+Pj4gMl07XG5cdCAgICAgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgIH1cblx0ICAgICAgICAgICAgdGhpcy5zaWdCeXRlcyArPSB0aGF0U2lnQnl0ZXM7XG5cblx0ICAgICAgICAgICAgLy8gQ2hhaW5hYmxlXG5cdCAgICAgICAgICAgIHJldHVybiB0aGlzO1xuXHQgICAgICAgIH0sXG5cblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBSZW1vdmVzIGluc2lnbmlmaWNhbnQgYml0cy5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgd29yZEFycmF5LmNsYW1wKCk7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgY2xhbXA6IGZ1bmN0aW9uICgpIHtcblx0ICAgICAgICAgICAgLy8gU2hvcnRjdXRzXG5cdCAgICAgICAgICAgIHZhciB3b3JkcyA9IHRoaXMud29yZHM7XG5cdCAgICAgICAgICAgIHZhciBzaWdCeXRlcyA9IHRoaXMuc2lnQnl0ZXM7XG5cblx0ICAgICAgICAgICAgLy8gQ2xhbXBcblx0ICAgICAgICAgICAgd29yZHNbc2lnQnl0ZXMgPj4+IDJdICY9IDB4ZmZmZmZmZmYgPDwgKDMyIC0gKHNpZ0J5dGVzICUgNCkgKiA4KTtcblx0ICAgICAgICAgICAgd29yZHMubGVuZ3RoID0gTWF0aC5jZWlsKHNpZ0J5dGVzIC8gNCk7XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIENyZWF0ZXMgYSBjb3B5IG9mIHRoaXMgd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEByZXR1cm4ge1dvcmRBcnJheX0gVGhlIGNsb25lLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgY2xvbmUgPSB3b3JkQXJyYXkuY2xvbmUoKTtcblx0ICAgICAgICAgKi9cblx0ICAgICAgICBjbG9uZTogZnVuY3Rpb24gKCkge1xuXHQgICAgICAgICAgICB2YXIgY2xvbmUgPSBCYXNlLmNsb25lLmNhbGwodGhpcyk7XG5cdCAgICAgICAgICAgIGNsb25lLndvcmRzID0gdGhpcy53b3Jkcy5zbGljZSgwKTtcblxuXHQgICAgICAgICAgICByZXR1cm4gY2xvbmU7XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIENyZWF0ZXMgYSB3b3JkIGFycmF5IGZpbGxlZCB3aXRoIHJhbmRvbSBieXRlcy5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBwYXJhbSB7bnVtYmVyfSBuQnl0ZXMgVGhlIG51bWJlciBvZiByYW5kb20gYnl0ZXMgdG8gZ2VuZXJhdGUuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcmV0dXJuIHtXb3JkQXJyYXl9IFRoZSByYW5kb20gd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBzdGF0aWNcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgdmFyIHdvcmRBcnJheSA9IENyeXB0b0pTLmxpYi5Xb3JkQXJyYXkucmFuZG9tKDE2KTtcblx0ICAgICAgICAgKi9cblx0ICAgICAgICByYW5kb206IGZ1bmN0aW9uIChuQnl0ZXMpIHtcblx0ICAgICAgICAgICAgdmFyIHdvcmRzID0gW107XG5cblx0ICAgICAgICAgICAgdmFyIHIgPSAoZnVuY3Rpb24gKG1fdykge1xuXHQgICAgICAgICAgICAgICAgdmFyIG1fdyA9IG1fdztcblx0ICAgICAgICAgICAgICAgIHZhciBtX3ogPSAweDNhZGU2OGIxO1xuXHQgICAgICAgICAgICAgICAgdmFyIG1hc2sgPSAweGZmZmZmZmZmO1xuXG5cdCAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuXHQgICAgICAgICAgICAgICAgICAgIG1feiA9ICgweDkwNjkgKiAobV96ICYgMHhGRkZGKSArIChtX3ogPj4gMHgxMCkpICYgbWFzaztcblx0ICAgICAgICAgICAgICAgICAgICBtX3cgPSAoMHg0NjUwICogKG1fdyAmIDB4RkZGRikgKyAobV93ID4+IDB4MTApKSAmIG1hc2s7XG5cdCAgICAgICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9ICgobV96IDw8IDB4MTApICsgbV93KSAmIG1hc2s7XG5cdCAgICAgICAgICAgICAgICAgICAgcmVzdWx0IC89IDB4MTAwMDAwMDAwO1xuXHQgICAgICAgICAgICAgICAgICAgIHJlc3VsdCArPSAwLjU7XG5cdCAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdCAqIChNYXRoLnJhbmRvbSgpID4gLjUgPyAxIDogLTEpO1xuXHQgICAgICAgICAgICAgICAgfVxuXHQgICAgICAgICAgICB9KTtcblxuXHQgICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgcmNhY2hlOyBpIDwgbkJ5dGVzOyBpICs9IDQpIHtcblx0ICAgICAgICAgICAgICAgIHZhciBfciA9IHIoKHJjYWNoZSB8fCBNYXRoLnJhbmRvbSgpKSAqIDB4MTAwMDAwMDAwKTtcblxuXHQgICAgICAgICAgICAgICAgcmNhY2hlID0gX3IoKSAqIDB4M2FkZTY3Yjc7XG5cdCAgICAgICAgICAgICAgICB3b3Jkcy5wdXNoKChfcigpICogMHgxMDAwMDAwMDApIHwgMCk7XG5cdCAgICAgICAgICAgIH1cblxuXHQgICAgICAgICAgICByZXR1cm4gbmV3IFdvcmRBcnJheS5pbml0KHdvcmRzLCBuQnl0ZXMpO1xuXHQgICAgICAgIH1cblx0ICAgIH0pO1xuXG5cdCAgICAvKipcblx0ICAgICAqIEVuY29kZXIgbmFtZXNwYWNlLlxuXHQgICAgICovXG5cdCAgICB2YXIgQ19lbmMgPSBDLmVuYyA9IHt9O1xuXG5cdCAgICAvKipcblx0ICAgICAqIEhleCBlbmNvZGluZyBzdHJhdGVneS5cblx0ICAgICAqL1xuXHQgICAgdmFyIEhleCA9IENfZW5jLkhleCA9IHtcblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBDb252ZXJ0cyBhIHdvcmQgYXJyYXkgdG8gYSBoZXggc3RyaW5nLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHBhcmFtIHtXb3JkQXJyYXl9IHdvcmRBcnJheSBUaGUgd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEByZXR1cm4ge3N0cmluZ30gVGhlIGhleCBzdHJpbmcuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAc3RhdGljXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAZXhhbXBsZVxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogICAgIHZhciBoZXhTdHJpbmcgPSBDcnlwdG9KUy5lbmMuSGV4LnN0cmluZ2lmeSh3b3JkQXJyYXkpO1xuXHQgICAgICAgICAqL1xuXHQgICAgICAgIHN0cmluZ2lmeTogZnVuY3Rpb24gKHdvcmRBcnJheSkge1xuXHQgICAgICAgICAgICAvLyBTaG9ydGN1dHNcblx0ICAgICAgICAgICAgdmFyIHdvcmRzID0gd29yZEFycmF5LndvcmRzO1xuXHQgICAgICAgICAgICB2YXIgc2lnQnl0ZXMgPSB3b3JkQXJyYXkuc2lnQnl0ZXM7XG5cblx0ICAgICAgICAgICAgLy8gQ29udmVydFxuXHQgICAgICAgICAgICB2YXIgaGV4Q2hhcnMgPSBbXTtcblx0ICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzaWdCeXRlczsgaSsrKSB7XG5cdCAgICAgICAgICAgICAgICB2YXIgYml0ZSA9ICh3b3Jkc1tpID4+PiAyXSA+Pj4gKDI0IC0gKGkgJSA0KSAqIDgpKSAmIDB4ZmY7XG5cdCAgICAgICAgICAgICAgICBoZXhDaGFycy5wdXNoKChiaXRlID4+PiA0KS50b1N0cmluZygxNikpO1xuXHQgICAgICAgICAgICAgICAgaGV4Q2hhcnMucHVzaCgoYml0ZSAmIDB4MGYpLnRvU3RyaW5nKDE2KSk7XG5cdCAgICAgICAgICAgIH1cblxuXHQgICAgICAgICAgICByZXR1cm4gaGV4Q2hhcnMuam9pbignJyk7XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIENvbnZlcnRzIGEgaGV4IHN0cmluZyB0byBhIHdvcmQgYXJyYXkuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gaGV4U3RyIFRoZSBoZXggc3RyaW5nLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHJldHVybiB7V29yZEFycmF5fSBUaGUgd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBzdGF0aWNcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgdmFyIHdvcmRBcnJheSA9IENyeXB0b0pTLmVuYy5IZXgucGFyc2UoaGV4U3RyaW5nKTtcblx0ICAgICAgICAgKi9cblx0ICAgICAgICBwYXJzZTogZnVuY3Rpb24gKGhleFN0cikge1xuXHQgICAgICAgICAgICAvLyBTaG9ydGN1dFxuXHQgICAgICAgICAgICB2YXIgaGV4U3RyTGVuZ3RoID0gaGV4U3RyLmxlbmd0aDtcblxuXHQgICAgICAgICAgICAvLyBDb252ZXJ0XG5cdCAgICAgICAgICAgIHZhciB3b3JkcyA9IFtdO1xuXHQgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGhleFN0ckxlbmd0aDsgaSArPSAyKSB7XG5cdCAgICAgICAgICAgICAgICB3b3Jkc1tpID4+PiAzXSB8PSBwYXJzZUludChoZXhTdHIuc3Vic3RyKGksIDIpLCAxNikgPDwgKDI0IC0gKGkgJSA4KSAqIDQpO1xuXHQgICAgICAgICAgICB9XG5cblx0ICAgICAgICAgICAgcmV0dXJuIG5ldyBXb3JkQXJyYXkuaW5pdCh3b3JkcywgaGV4U3RyTGVuZ3RoIC8gMik7XG5cdCAgICAgICAgfVxuXHQgICAgfTtcblxuXHQgICAgLyoqXG5cdCAgICAgKiBMYXRpbjEgZW5jb2Rpbmcgc3RyYXRlZ3kuXG5cdCAgICAgKi9cblx0ICAgIHZhciBMYXRpbjEgPSBDX2VuYy5MYXRpbjEgPSB7XG5cdCAgICAgICAgLyoqXG5cdCAgICAgICAgICogQ29udmVydHMgYSB3b3JkIGFycmF5IHRvIGEgTGF0aW4xIHN0cmluZy5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBwYXJhbSB7V29yZEFycmF5fSB3b3JkQXJyYXkgVGhlIHdvcmQgYXJyYXkuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IFRoZSBMYXRpbjEgc3RyaW5nLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHN0YXRpY1xuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgbGF0aW4xU3RyaW5nID0gQ3J5cHRvSlMuZW5jLkxhdGluMS5zdHJpbmdpZnkod29yZEFycmF5KTtcblx0ICAgICAgICAgKi9cblx0ICAgICAgICBzdHJpbmdpZnk6IGZ1bmN0aW9uICh3b3JkQXJyYXkpIHtcblx0ICAgICAgICAgICAgLy8gU2hvcnRjdXRzXG5cdCAgICAgICAgICAgIHZhciB3b3JkcyA9IHdvcmRBcnJheS53b3Jkcztcblx0ICAgICAgICAgICAgdmFyIHNpZ0J5dGVzID0gd29yZEFycmF5LnNpZ0J5dGVzO1xuXG5cdCAgICAgICAgICAgIC8vIENvbnZlcnRcblx0ICAgICAgICAgICAgdmFyIGxhdGluMUNoYXJzID0gW107XG5cdCAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc2lnQnl0ZXM7IGkrKykge1xuXHQgICAgICAgICAgICAgICAgdmFyIGJpdGUgPSAod29yZHNbaSA+Pj4gMl0gPj4+ICgyNCAtIChpICUgNCkgKiA4KSkgJiAweGZmO1xuXHQgICAgICAgICAgICAgICAgbGF0aW4xQ2hhcnMucHVzaChTdHJpbmcuZnJvbUNoYXJDb2RlKGJpdGUpKTtcblx0ICAgICAgICAgICAgfVxuXG5cdCAgICAgICAgICAgIHJldHVybiBsYXRpbjFDaGFycy5qb2luKCcnKTtcblx0ICAgICAgICB9LFxuXG5cdCAgICAgICAgLyoqXG5cdCAgICAgICAgICogQ29udmVydHMgYSBMYXRpbjEgc3RyaW5nIHRvIGEgd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSBsYXRpbjFTdHIgVGhlIExhdGluMSBzdHJpbmcuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcmV0dXJuIHtXb3JkQXJyYXl9IFRoZSB3b3JkIGFycmF5LlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHN0YXRpY1xuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgd29yZEFycmF5ID0gQ3J5cHRvSlMuZW5jLkxhdGluMS5wYXJzZShsYXRpbjFTdHJpbmcpO1xuXHQgICAgICAgICAqL1xuXHQgICAgICAgIHBhcnNlOiBmdW5jdGlvbiAobGF0aW4xU3RyKSB7XG5cdCAgICAgICAgICAgIC8vIFNob3J0Y3V0XG5cdCAgICAgICAgICAgIHZhciBsYXRpbjFTdHJMZW5ndGggPSBsYXRpbjFTdHIubGVuZ3RoO1xuXG5cdCAgICAgICAgICAgIC8vIENvbnZlcnRcblx0ICAgICAgICAgICAgdmFyIHdvcmRzID0gW107XG5cdCAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGF0aW4xU3RyTGVuZ3RoOyBpKyspIHtcblx0ICAgICAgICAgICAgICAgIHdvcmRzW2kgPj4+IDJdIHw9IChsYXRpbjFTdHIuY2hhckNvZGVBdChpKSAmIDB4ZmYpIDw8ICgyNCAtIChpICUgNCkgKiA4KTtcblx0ICAgICAgICAgICAgfVxuXG5cdCAgICAgICAgICAgIHJldHVybiBuZXcgV29yZEFycmF5LmluaXQod29yZHMsIGxhdGluMVN0ckxlbmd0aCk7XG5cdCAgICAgICAgfVxuXHQgICAgfTtcblxuXHQgICAgLyoqXG5cdCAgICAgKiBVVEYtOCBlbmNvZGluZyBzdHJhdGVneS5cblx0ICAgICAqL1xuXHQgICAgdmFyIFV0ZjggPSBDX2VuYy5VdGY4ID0ge1xuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIENvbnZlcnRzIGEgd29yZCBhcnJheSB0byBhIFVURi04IHN0cmluZy5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBwYXJhbSB7V29yZEFycmF5fSB3b3JkQXJyYXkgVGhlIHdvcmQgYXJyYXkuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IFRoZSBVVEYtOCBzdHJpbmcuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAc3RhdGljXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAZXhhbXBsZVxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogICAgIHZhciB1dGY4U3RyaW5nID0gQ3J5cHRvSlMuZW5jLlV0Zjguc3RyaW5naWZ5KHdvcmRBcnJheSk7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgc3RyaW5naWZ5OiBmdW5jdGlvbiAod29yZEFycmF5KSB7XG5cdCAgICAgICAgICAgIHRyeSB7XG5cdCAgICAgICAgICAgICAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KGVzY2FwZShMYXRpbjEuc3RyaW5naWZ5KHdvcmRBcnJheSkpKTtcblx0ICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuXHQgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdNYWxmb3JtZWQgVVRGLTggZGF0YScpO1xuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIENvbnZlcnRzIGEgVVRGLTggc3RyaW5nIHRvIGEgd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSB1dGY4U3RyIFRoZSBVVEYtOCBzdHJpbmcuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcmV0dXJuIHtXb3JkQXJyYXl9IFRoZSB3b3JkIGFycmF5LlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHN0YXRpY1xuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgd29yZEFycmF5ID0gQ3J5cHRvSlMuZW5jLlV0ZjgucGFyc2UodXRmOFN0cmluZyk7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgcGFyc2U6IGZ1bmN0aW9uICh1dGY4U3RyKSB7XG5cdCAgICAgICAgICAgIHJldHVybiBMYXRpbjEucGFyc2UodW5lc2NhcGUoZW5jb2RlVVJJQ29tcG9uZW50KHV0ZjhTdHIpKSk7XG5cdCAgICAgICAgfVxuXHQgICAgfTtcblxuXHQgICAgLyoqXG5cdCAgICAgKiBBYnN0cmFjdCBidWZmZXJlZCBibG9jayBhbGdvcml0aG0gdGVtcGxhdGUuXG5cdCAgICAgKlxuXHQgICAgICogVGhlIHByb3BlcnR5IGJsb2NrU2l6ZSBtdXN0IGJlIGltcGxlbWVudGVkIGluIGEgY29uY3JldGUgc3VidHlwZS5cblx0ICAgICAqXG5cdCAgICAgKiBAcHJvcGVydHkge251bWJlcn0gX21pbkJ1ZmZlclNpemUgVGhlIG51bWJlciBvZiBibG9ja3MgdGhhdCBzaG91bGQgYmUga2VwdCB1bnByb2Nlc3NlZCBpbiB0aGUgYnVmZmVyLiBEZWZhdWx0OiAwXG5cdCAgICAgKi9cblx0ICAgIHZhciBCdWZmZXJlZEJsb2NrQWxnb3JpdGhtID0gQ19saWIuQnVmZmVyZWRCbG9ja0FsZ29yaXRobSA9IEJhc2UuZXh0ZW5kKHtcblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBSZXNldHMgdGhpcyBibG9jayBhbGdvcml0aG0ncyBkYXRhIGJ1ZmZlciB0byBpdHMgaW5pdGlhbCBzdGF0ZS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgYnVmZmVyZWRCbG9ja0FsZ29yaXRobS5yZXNldCgpO1xuXHQgICAgICAgICAqL1xuXHQgICAgICAgIHJlc2V0OiBmdW5jdGlvbiAoKSB7XG5cdCAgICAgICAgICAgIC8vIEluaXRpYWwgdmFsdWVzXG5cdCAgICAgICAgICAgIHRoaXMuX2RhdGEgPSBuZXcgV29yZEFycmF5LmluaXQoKTtcblx0ICAgICAgICAgICAgdGhpcy5fbkRhdGFCeXRlcyA9IDA7XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIEFkZHMgbmV3IGRhdGEgdG8gdGhpcyBibG9jayBhbGdvcml0aG0ncyBidWZmZXIuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcGFyYW0ge1dvcmRBcnJheXxzdHJpbmd9IGRhdGEgVGhlIGRhdGEgdG8gYXBwZW5kLiBTdHJpbmdzIGFyZSBjb252ZXJ0ZWQgdG8gYSBXb3JkQXJyYXkgdXNpbmcgVVRGLTguXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAZXhhbXBsZVxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogICAgIGJ1ZmZlcmVkQmxvY2tBbGdvcml0aG0uX2FwcGVuZCgnZGF0YScpO1xuXHQgICAgICAgICAqICAgICBidWZmZXJlZEJsb2NrQWxnb3JpdGhtLl9hcHBlbmQod29yZEFycmF5KTtcblx0ICAgICAgICAgKi9cblx0ICAgICAgICBfYXBwZW5kOiBmdW5jdGlvbiAoZGF0YSkge1xuXHQgICAgICAgICAgICAvLyBDb252ZXJ0IHN0cmluZyB0byBXb3JkQXJyYXksIGVsc2UgYXNzdW1lIFdvcmRBcnJheSBhbHJlYWR5XG5cdCAgICAgICAgICAgIGlmICh0eXBlb2YgZGF0YSA9PSAnc3RyaW5nJykge1xuXHQgICAgICAgICAgICAgICAgZGF0YSA9IFV0ZjgucGFyc2UoZGF0YSk7XG5cdCAgICAgICAgICAgIH1cblxuXHQgICAgICAgICAgICAvLyBBcHBlbmRcblx0ICAgICAgICAgICAgdGhpcy5fZGF0YS5jb25jYXQoZGF0YSk7XG5cdCAgICAgICAgICAgIHRoaXMuX25EYXRhQnl0ZXMgKz0gZGF0YS5zaWdCeXRlcztcblx0ICAgICAgICB9LFxuXG5cdCAgICAgICAgLyoqXG5cdCAgICAgICAgICogUHJvY2Vzc2VzIGF2YWlsYWJsZSBkYXRhIGJsb2Nrcy5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIFRoaXMgbWV0aG9kIGludm9rZXMgX2RvUHJvY2Vzc0Jsb2NrKG9mZnNldCksIHdoaWNoIG11c3QgYmUgaW1wbGVtZW50ZWQgYnkgYSBjb25jcmV0ZSBzdWJ0eXBlLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHBhcmFtIHtib29sZWFufSBkb0ZsdXNoIFdoZXRoZXIgYWxsIGJsb2NrcyBhbmQgcGFydGlhbCBibG9ja3Mgc2hvdWxkIGJlIHByb2Nlc3NlZC5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEByZXR1cm4ge1dvcmRBcnJheX0gVGhlIHByb2Nlc3NlZCBkYXRhLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgcHJvY2Vzc2VkRGF0YSA9IGJ1ZmZlcmVkQmxvY2tBbGdvcml0aG0uX3Byb2Nlc3MoKTtcblx0ICAgICAgICAgKiAgICAgdmFyIHByb2Nlc3NlZERhdGEgPSBidWZmZXJlZEJsb2NrQWxnb3JpdGhtLl9wcm9jZXNzKCEhJ2ZsdXNoJyk7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgX3Byb2Nlc3M6IGZ1bmN0aW9uIChkb0ZsdXNoKSB7XG5cdCAgICAgICAgICAgIC8vIFNob3J0Y3V0c1xuXHQgICAgICAgICAgICB2YXIgZGF0YSA9IHRoaXMuX2RhdGE7XG5cdCAgICAgICAgICAgIHZhciBkYXRhV29yZHMgPSBkYXRhLndvcmRzO1xuXHQgICAgICAgICAgICB2YXIgZGF0YVNpZ0J5dGVzID0gZGF0YS5zaWdCeXRlcztcblx0ICAgICAgICAgICAgdmFyIGJsb2NrU2l6ZSA9IHRoaXMuYmxvY2tTaXplO1xuXHQgICAgICAgICAgICB2YXIgYmxvY2tTaXplQnl0ZXMgPSBibG9ja1NpemUgKiA0O1xuXG5cdCAgICAgICAgICAgIC8vIENvdW50IGJsb2NrcyByZWFkeVxuXHQgICAgICAgICAgICB2YXIgbkJsb2Nrc1JlYWR5ID0gZGF0YVNpZ0J5dGVzIC8gYmxvY2tTaXplQnl0ZXM7XG5cdCAgICAgICAgICAgIGlmIChkb0ZsdXNoKSB7XG5cdCAgICAgICAgICAgICAgICAvLyBSb3VuZCB1cCB0byBpbmNsdWRlIHBhcnRpYWwgYmxvY2tzXG5cdCAgICAgICAgICAgICAgICBuQmxvY2tzUmVhZHkgPSBNYXRoLmNlaWwobkJsb2Nrc1JlYWR5KTtcblx0ICAgICAgICAgICAgfSBlbHNlIHtcblx0ICAgICAgICAgICAgICAgIC8vIFJvdW5kIGRvd24gdG8gaW5jbHVkZSBvbmx5IGZ1bGwgYmxvY2tzLFxuXHQgICAgICAgICAgICAgICAgLy8gbGVzcyB0aGUgbnVtYmVyIG9mIGJsb2NrcyB0aGF0IG11c3QgcmVtYWluIGluIHRoZSBidWZmZXJcblx0ICAgICAgICAgICAgICAgIG5CbG9ja3NSZWFkeSA9IE1hdGgubWF4KChuQmxvY2tzUmVhZHkgfCAwKSAtIHRoaXMuX21pbkJ1ZmZlclNpemUsIDApO1xuXHQgICAgICAgICAgICB9XG5cblx0ICAgICAgICAgICAgLy8gQ291bnQgd29yZHMgcmVhZHlcblx0ICAgICAgICAgICAgdmFyIG5Xb3Jkc1JlYWR5ID0gbkJsb2Nrc1JlYWR5ICogYmxvY2tTaXplO1xuXG5cdCAgICAgICAgICAgIC8vIENvdW50IGJ5dGVzIHJlYWR5XG5cdCAgICAgICAgICAgIHZhciBuQnl0ZXNSZWFkeSA9IE1hdGgubWluKG5Xb3Jkc1JlYWR5ICogNCwgZGF0YVNpZ0J5dGVzKTtcblxuXHQgICAgICAgICAgICAvLyBQcm9jZXNzIGJsb2Nrc1xuXHQgICAgICAgICAgICBpZiAobldvcmRzUmVhZHkpIHtcblx0ICAgICAgICAgICAgICAgIGZvciAodmFyIG9mZnNldCA9IDA7IG9mZnNldCA8IG5Xb3Jkc1JlYWR5OyBvZmZzZXQgKz0gYmxvY2tTaXplKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgLy8gUGVyZm9ybSBjb25jcmV0ZS1hbGdvcml0aG0gbG9naWNcblx0ICAgICAgICAgICAgICAgICAgICB0aGlzLl9kb1Byb2Nlc3NCbG9jayhkYXRhV29yZHMsIG9mZnNldCk7XG5cdCAgICAgICAgICAgICAgICB9XG5cblx0ICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBwcm9jZXNzZWQgd29yZHNcblx0ICAgICAgICAgICAgICAgIHZhciBwcm9jZXNzZWRXb3JkcyA9IGRhdGFXb3Jkcy5zcGxpY2UoMCwgbldvcmRzUmVhZHkpO1xuXHQgICAgICAgICAgICAgICAgZGF0YS5zaWdCeXRlcyAtPSBuQnl0ZXNSZWFkeTtcblx0ICAgICAgICAgICAgfVxuXG5cdCAgICAgICAgICAgIC8vIFJldHVybiBwcm9jZXNzZWQgd29yZHNcblx0ICAgICAgICAgICAgcmV0dXJuIG5ldyBXb3JkQXJyYXkuaW5pdChwcm9jZXNzZWRXb3JkcywgbkJ5dGVzUmVhZHkpO1xuXHQgICAgICAgIH0sXG5cblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBDcmVhdGVzIGEgY29weSBvZiB0aGlzIG9iamVjdC5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEByZXR1cm4ge09iamVjdH0gVGhlIGNsb25lLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgY2xvbmUgPSBidWZmZXJlZEJsb2NrQWxnb3JpdGhtLmNsb25lKCk7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgY2xvbmU6IGZ1bmN0aW9uICgpIHtcblx0ICAgICAgICAgICAgdmFyIGNsb25lID0gQmFzZS5jbG9uZS5jYWxsKHRoaXMpO1xuXHQgICAgICAgICAgICBjbG9uZS5fZGF0YSA9IHRoaXMuX2RhdGEuY2xvbmUoKTtcblxuXHQgICAgICAgICAgICByZXR1cm4gY2xvbmU7XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIF9taW5CdWZmZXJTaXplOiAwXG5cdCAgICB9KTtcblxuXHQgICAgLyoqXG5cdCAgICAgKiBBYnN0cmFjdCBoYXNoZXIgdGVtcGxhdGUuXG5cdCAgICAgKlxuXHQgICAgICogQHByb3BlcnR5IHtudW1iZXJ9IGJsb2NrU2l6ZSBUaGUgbnVtYmVyIG9mIDMyLWJpdCB3b3JkcyB0aGlzIGhhc2hlciBvcGVyYXRlcyBvbi4gRGVmYXVsdDogMTYgKDUxMiBiaXRzKVxuXHQgICAgICovXG5cdCAgICB2YXIgSGFzaGVyID0gQ19saWIuSGFzaGVyID0gQnVmZmVyZWRCbG9ja0FsZ29yaXRobS5leHRlbmQoe1xuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucy5cblx0ICAgICAgICAgKi9cblx0ICAgICAgICBjZmc6IEJhc2UuZXh0ZW5kKCksXG5cblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBJbml0aWFsaXplcyBhIG5ld2x5IGNyZWF0ZWQgaGFzaGVyLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IGNmZyAoT3B0aW9uYWwpIFRoZSBjb25maWd1cmF0aW9uIG9wdGlvbnMgdG8gdXNlIGZvciB0aGlzIGhhc2ggY29tcHV0YXRpb24uXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAZXhhbXBsZVxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogICAgIHZhciBoYXNoZXIgPSBDcnlwdG9KUy5hbGdvLlNIQTI1Ni5jcmVhdGUoKTtcblx0ICAgICAgICAgKi9cblx0ICAgICAgICBpbml0OiBmdW5jdGlvbiAoY2ZnKSB7XG5cdCAgICAgICAgICAgIC8vIEFwcGx5IGNvbmZpZyBkZWZhdWx0c1xuXHQgICAgICAgICAgICB0aGlzLmNmZyA9IHRoaXMuY2ZnLmV4dGVuZChjZmcpO1xuXG5cdCAgICAgICAgICAgIC8vIFNldCBpbml0aWFsIHZhbHVlc1xuXHQgICAgICAgICAgICB0aGlzLnJlc2V0KCk7XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIFJlc2V0cyB0aGlzIGhhc2hlciB0byBpdHMgaW5pdGlhbCBzdGF0ZS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgaGFzaGVyLnJlc2V0KCk7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgcmVzZXQ6IGZ1bmN0aW9uICgpIHtcblx0ICAgICAgICAgICAgLy8gUmVzZXQgZGF0YSBidWZmZXJcblx0ICAgICAgICAgICAgQnVmZmVyZWRCbG9ja0FsZ29yaXRobS5yZXNldC5jYWxsKHRoaXMpO1xuXG5cdCAgICAgICAgICAgIC8vIFBlcmZvcm0gY29uY3JldGUtaGFzaGVyIGxvZ2ljXG5cdCAgICAgICAgICAgIHRoaXMuX2RvUmVzZXQoKTtcblx0ICAgICAgICB9LFxuXG5cdCAgICAgICAgLyoqXG5cdCAgICAgICAgICogVXBkYXRlcyB0aGlzIGhhc2hlciB3aXRoIGEgbWVzc2FnZS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBwYXJhbSB7V29yZEFycmF5fHN0cmluZ30gbWVzc2FnZVVwZGF0ZSBUaGUgbWVzc2FnZSB0byBhcHBlbmQuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcmV0dXJuIHtIYXNoZXJ9IFRoaXMgaGFzaGVyLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICBoYXNoZXIudXBkYXRlKCdtZXNzYWdlJyk7XG5cdCAgICAgICAgICogICAgIGhhc2hlci51cGRhdGUod29yZEFycmF5KTtcblx0ICAgICAgICAgKi9cblx0ICAgICAgICB1cGRhdGU6IGZ1bmN0aW9uIChtZXNzYWdlVXBkYXRlKSB7XG5cdCAgICAgICAgICAgIC8vIEFwcGVuZFxuXHQgICAgICAgICAgICB0aGlzLl9hcHBlbmQobWVzc2FnZVVwZGF0ZSk7XG5cblx0ICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBoYXNoXG5cdCAgICAgICAgICAgIHRoaXMuX3Byb2Nlc3MoKTtcblxuXHQgICAgICAgICAgICAvLyBDaGFpbmFibGVcblx0ICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIEZpbmFsaXplcyB0aGUgaGFzaCBjb21wdXRhdGlvbi5cblx0ICAgICAgICAgKiBOb3RlIHRoYXQgdGhlIGZpbmFsaXplIG9wZXJhdGlvbiBpcyBlZmZlY3RpdmVseSBhIGRlc3RydWN0aXZlLCByZWFkLW9uY2Ugb3BlcmF0aW9uLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHBhcmFtIHtXb3JkQXJyYXl8c3RyaW5nfSBtZXNzYWdlVXBkYXRlIChPcHRpb25hbCkgQSBmaW5hbCBtZXNzYWdlIHVwZGF0ZS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEByZXR1cm4ge1dvcmRBcnJheX0gVGhlIGhhc2guXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAZXhhbXBsZVxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogICAgIHZhciBoYXNoID0gaGFzaGVyLmZpbmFsaXplKCk7XG5cdCAgICAgICAgICogICAgIHZhciBoYXNoID0gaGFzaGVyLmZpbmFsaXplKCdtZXNzYWdlJyk7XG5cdCAgICAgICAgICogICAgIHZhciBoYXNoID0gaGFzaGVyLmZpbmFsaXplKHdvcmRBcnJheSk7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgZmluYWxpemU6IGZ1bmN0aW9uIChtZXNzYWdlVXBkYXRlKSB7XG5cdCAgICAgICAgICAgIC8vIEZpbmFsIG1lc3NhZ2UgdXBkYXRlXG5cdCAgICAgICAgICAgIGlmIChtZXNzYWdlVXBkYXRlKSB7XG5cdCAgICAgICAgICAgICAgICB0aGlzLl9hcHBlbmQobWVzc2FnZVVwZGF0ZSk7XG5cdCAgICAgICAgICAgIH1cblxuXHQgICAgICAgICAgICAvLyBQZXJmb3JtIGNvbmNyZXRlLWhhc2hlciBsb2dpY1xuXHQgICAgICAgICAgICB2YXIgaGFzaCA9IHRoaXMuX2RvRmluYWxpemUoKTtcblxuXHQgICAgICAgICAgICByZXR1cm4gaGFzaDtcblx0ICAgICAgICB9LFxuXG5cdCAgICAgICAgYmxvY2tTaXplOiA1MTIvMzIsXG5cblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBDcmVhdGVzIGEgc2hvcnRjdXQgZnVuY3Rpb24gdG8gYSBoYXNoZXIncyBvYmplY3QgaW50ZXJmYWNlLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHBhcmFtIHtIYXNoZXJ9IGhhc2hlciBUaGUgaGFzaGVyIHRvIGNyZWF0ZSBhIGhlbHBlciBmb3IuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0gVGhlIHNob3J0Y3V0IGZ1bmN0aW9uLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHN0YXRpY1xuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgU0hBMjU2ID0gQ3J5cHRvSlMubGliLkhhc2hlci5fY3JlYXRlSGVscGVyKENyeXB0b0pTLmFsZ28uU0hBMjU2KTtcblx0ICAgICAgICAgKi9cblx0ICAgICAgICBfY3JlYXRlSGVscGVyOiBmdW5jdGlvbiAoaGFzaGVyKSB7XG5cdCAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiAobWVzc2FnZSwgY2ZnKSB7XG5cdCAgICAgICAgICAgICAgICByZXR1cm4gbmV3IGhhc2hlci5pbml0KGNmZykuZmluYWxpemUobWVzc2FnZSk7XG5cdCAgICAgICAgICAgIH07XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIENyZWF0ZXMgYSBzaG9ydGN1dCBmdW5jdGlvbiB0byB0aGUgSE1BQydzIG9iamVjdCBpbnRlcmZhY2UuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcGFyYW0ge0hhc2hlcn0gaGFzaGVyIFRoZSBoYXNoZXIgdG8gdXNlIGluIHRoaXMgSE1BQyBoZWxwZXIuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcmV0dXJuIHtGdW5jdGlvbn0gVGhlIHNob3J0Y3V0IGZ1bmN0aW9uLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHN0YXRpY1xuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgSG1hY1NIQTI1NiA9IENyeXB0b0pTLmxpYi5IYXNoZXIuX2NyZWF0ZUhtYWNIZWxwZXIoQ3J5cHRvSlMuYWxnby5TSEEyNTYpO1xuXHQgICAgICAgICAqL1xuXHQgICAgICAgIF9jcmVhdGVIbWFjSGVscGVyOiBmdW5jdGlvbiAoaGFzaGVyKSB7XG5cdCAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiAobWVzc2FnZSwga2V5KSB7XG5cdCAgICAgICAgICAgICAgICByZXR1cm4gbmV3IENfYWxnby5ITUFDLmluaXQoaGFzaGVyLCBrZXkpLmZpbmFsaXplKG1lc3NhZ2UpO1xuXHQgICAgICAgICAgICB9O1xuXHQgICAgICAgIH1cblx0ICAgIH0pO1xuXG5cdCAgICAvKipcblx0ICAgICAqIEFsZ29yaXRobSBuYW1lc3BhY2UuXG5cdCAgICAgKi9cblx0ICAgIHZhciBDX2FsZ28gPSBDLmFsZ28gPSB7fTtcblxuXHQgICAgcmV0dXJuIEM7XG5cdH0oTWF0aCkpO1xuXG5cblx0cmV0dXJuIENyeXB0b0pTO1xuXG59KSk7IiwiOyhmdW5jdGlvbiAocm9vdCwgZmFjdG9yeSwgdW5kZWYpIHtcblx0aWYgKHR5cGVvZiBleHBvcnRzID09PSBcIm9iamVjdFwiKSB7XG5cdFx0Ly8gQ29tbW9uSlNcblx0XHRtb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHMgPSBmYWN0b3J5KHJlcXVpcmUoXCIuL2NvcmVcIiksIHJlcXVpcmUoXCIuL3g2NC1jb3JlXCIpKTtcblx0fVxuXHRlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xuXHRcdC8vIEFNRFxuXHRcdGRlZmluZShbXCIuL2NvcmVcIiwgXCIuL3g2NC1jb3JlXCJdLCBmYWN0b3J5KTtcblx0fVxuXHRlbHNlIHtcblx0XHQvLyBHbG9iYWwgKGJyb3dzZXIpXG5cdFx0ZmFjdG9yeShyb290LkNyeXB0b0pTKTtcblx0fVxufSh0aGlzLCBmdW5jdGlvbiAoQ3J5cHRvSlMpIHtcblxuXHQoZnVuY3Rpb24gKE1hdGgpIHtcblx0ICAgIC8vIFNob3J0Y3V0c1xuXHQgICAgdmFyIEMgPSBDcnlwdG9KUztcblx0ICAgIHZhciBDX2xpYiA9IEMubGliO1xuXHQgICAgdmFyIFdvcmRBcnJheSA9IENfbGliLldvcmRBcnJheTtcblx0ICAgIHZhciBIYXNoZXIgPSBDX2xpYi5IYXNoZXI7XG5cdCAgICB2YXIgQ194NjQgPSBDLng2NDtcblx0ICAgIHZhciBYNjRXb3JkID0gQ194NjQuV29yZDtcblx0ICAgIHZhciBDX2FsZ28gPSBDLmFsZ287XG5cblx0ICAgIC8vIENvbnN0YW50cyB0YWJsZXNcblx0ICAgIHZhciBSSE9fT0ZGU0VUUyA9IFtdO1xuXHQgICAgdmFyIFBJX0lOREVYRVMgID0gW107XG5cdCAgICB2YXIgUk9VTkRfQ09OU1RBTlRTID0gW107XG5cblx0ICAgIC8vIENvbXB1dGUgQ29uc3RhbnRzXG5cdCAgICAoZnVuY3Rpb24gKCkge1xuXHQgICAgICAgIC8vIENvbXB1dGUgcmhvIG9mZnNldCBjb25zdGFudHNcblx0ICAgICAgICB2YXIgeCA9IDEsIHkgPSAwO1xuXHQgICAgICAgIGZvciAodmFyIHQgPSAwOyB0IDwgMjQ7IHQrKykge1xuXHQgICAgICAgICAgICBSSE9fT0ZGU0VUU1t4ICsgNSAqIHldID0gKCh0ICsgMSkgKiAodCArIDIpIC8gMikgJSA2NDtcblxuXHQgICAgICAgICAgICB2YXIgbmV3WCA9IHkgJSA1O1xuXHQgICAgICAgICAgICB2YXIgbmV3WSA9ICgyICogeCArIDMgKiB5KSAlIDU7XG5cdCAgICAgICAgICAgIHggPSBuZXdYO1xuXHQgICAgICAgICAgICB5ID0gbmV3WTtcblx0ICAgICAgICB9XG5cblx0ICAgICAgICAvLyBDb21wdXRlIHBpIGluZGV4IGNvbnN0YW50c1xuXHQgICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgNTsgeCsrKSB7XG5cdCAgICAgICAgICAgIGZvciAodmFyIHkgPSAwOyB5IDwgNTsgeSsrKSB7XG5cdCAgICAgICAgICAgICAgICBQSV9JTkRFWEVTW3ggKyA1ICogeV0gPSB5ICsgKCgyICogeCArIDMgKiB5KSAlIDUpICogNTtcblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgIH1cblxuXHQgICAgICAgIC8vIENvbXB1dGUgcm91bmQgY29uc3RhbnRzXG5cdCAgICAgICAgdmFyIExGU1IgPSAweDAxO1xuXHQgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgMjQ7IGkrKykge1xuXHQgICAgICAgICAgICB2YXIgcm91bmRDb25zdGFudE1zdyA9IDA7XG5cdCAgICAgICAgICAgIHZhciByb3VuZENvbnN0YW50THN3ID0gMDtcblxuXHQgICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IDc7IGorKykge1xuXHQgICAgICAgICAgICAgICAgaWYgKExGU1IgJiAweDAxKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgdmFyIGJpdFBvc2l0aW9uID0gKDEgPDwgaikgLSAxO1xuXHQgICAgICAgICAgICAgICAgICAgIGlmIChiaXRQb3NpdGlvbiA8IDMyKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgICAgIHJvdW5kQ29uc3RhbnRMc3cgXj0gMSA8PCBiaXRQb3NpdGlvbjtcblx0ICAgICAgICAgICAgICAgICAgICB9IGVsc2UgLyogaWYgKGJpdFBvc2l0aW9uID49IDMyKSAqLyB7XG5cdCAgICAgICAgICAgICAgICAgICAgICAgIHJvdW5kQ29uc3RhbnRNc3cgXj0gMSA8PCAoYml0UG9zaXRpb24gLSAzMik7XG5cdCAgICAgICAgICAgICAgICAgICAgfVxuXHQgICAgICAgICAgICAgICAgfVxuXG5cdCAgICAgICAgICAgICAgICAvLyBDb21wdXRlIG5leHQgTEZTUlxuXHQgICAgICAgICAgICAgICAgaWYgKExGU1IgJiAweDgwKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgLy8gUHJpbWl0aXZlIHBvbHlub21pYWwgb3ZlciBHRigyKTogeF44ICsgeF42ICsgeF41ICsgeF40ICsgMVxuXHQgICAgICAgICAgICAgICAgICAgIExGU1IgPSAoTEZTUiA8PCAxKSBeIDB4NzE7XG5cdCAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXHQgICAgICAgICAgICAgICAgICAgIExGU1IgPDw9IDE7XG5cdCAgICAgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgIH1cblxuXHQgICAgICAgICAgICBST1VORF9DT05TVEFOVFNbaV0gPSBYNjRXb3JkLmNyZWF0ZShyb3VuZENvbnN0YW50TXN3LCByb3VuZENvbnN0YW50THN3KTtcblx0ICAgICAgICB9XG5cdCAgICB9KCkpO1xuXG5cdCAgICAvLyBSZXVzYWJsZSBvYmplY3RzIGZvciB0ZW1wb3JhcnkgdmFsdWVzXG5cdCAgICB2YXIgVCA9IFtdO1xuXHQgICAgKGZ1bmN0aW9uICgpIHtcblx0ICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDI1OyBpKyspIHtcblx0ICAgICAgICAgICAgVFtpXSA9IFg2NFdvcmQuY3JlYXRlKCk7XG5cdCAgICAgICAgfVxuXHQgICAgfSgpKTtcblxuXHQgICAgLyoqXG5cdCAgICAgKiBTSEEtMyBoYXNoIGFsZ29yaXRobS5cblx0ICAgICAqL1xuXHQgICAgdmFyIFNIQTMgPSBDX2FsZ28uU0hBMyA9IEhhc2hlci5leHRlbmQoe1xuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucy5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBvdXRwdXRMZW5ndGhcblx0ICAgICAgICAgKiAgIFRoZSBkZXNpcmVkIG51bWJlciBvZiBiaXRzIGluIHRoZSBvdXRwdXQgaGFzaC5cblx0ICAgICAgICAgKiAgIE9ubHkgdmFsdWVzIHBlcm1pdHRlZCBhcmU6IDIyNCwgMjU2LCAzODQsIDUxMi5cblx0ICAgICAgICAgKiAgIERlZmF1bHQ6IDUxMlxuXHQgICAgICAgICAqL1xuXHQgICAgICAgIGNmZzogSGFzaGVyLmNmZy5leHRlbmQoe1xuXHQgICAgICAgICAgICBvdXRwdXRMZW5ndGg6IDUxMlxuXHQgICAgICAgIH0pLFxuXG5cdCAgICAgICAgX2RvUmVzZXQ6IGZ1bmN0aW9uICgpIHtcblx0ICAgICAgICAgICAgdmFyIHN0YXRlID0gdGhpcy5fc3RhdGUgPSBbXVxuXHQgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDI1OyBpKyspIHtcblx0ICAgICAgICAgICAgICAgIHN0YXRlW2ldID0gbmV3IFg2NFdvcmQuaW5pdCgpO1xuXHQgICAgICAgICAgICB9XG5cblx0ICAgICAgICAgICAgdGhpcy5ibG9ja1NpemUgPSAoMTYwMCAtIDIgKiB0aGlzLmNmZy5vdXRwdXRMZW5ndGgpIC8gMzI7XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIF9kb1Byb2Nlc3NCbG9jazogZnVuY3Rpb24gKE0sIG9mZnNldCkge1xuXHQgICAgICAgICAgICAvLyBTaG9ydGN1dHNcblx0ICAgICAgICAgICAgdmFyIHN0YXRlID0gdGhpcy5fc3RhdGU7XG5cdCAgICAgICAgICAgIHZhciBuQmxvY2tTaXplTGFuZXMgPSB0aGlzLmJsb2NrU2l6ZSAvIDI7XG5cblx0ICAgICAgICAgICAgLy8gQWJzb3JiXG5cdCAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbkJsb2NrU2l6ZUxhbmVzOyBpKyspIHtcblx0ICAgICAgICAgICAgICAgIC8vIFNob3J0Y3V0c1xuXHQgICAgICAgICAgICAgICAgdmFyIE0yaSAgPSBNW29mZnNldCArIDIgKiBpXTtcblx0ICAgICAgICAgICAgICAgIHZhciBNMmkxID0gTVtvZmZzZXQgKyAyICogaSArIDFdO1xuXG5cdCAgICAgICAgICAgICAgICAvLyBTd2FwIGVuZGlhblxuXHQgICAgICAgICAgICAgICAgTTJpID0gKFxuXHQgICAgICAgICAgICAgICAgICAgICgoKE0yaSA8PCA4KSAgfCAoTTJpID4+PiAyNCkpICYgMHgwMGZmMDBmZikgfFxuXHQgICAgICAgICAgICAgICAgICAgICgoKE0yaSA8PCAyNCkgfCAoTTJpID4+PiA4KSkgICYgMHhmZjAwZmYwMClcblx0ICAgICAgICAgICAgICAgICk7XG5cdCAgICAgICAgICAgICAgICBNMmkxID0gKFxuXHQgICAgICAgICAgICAgICAgICAgICgoKE0yaTEgPDwgOCkgIHwgKE0yaTEgPj4+IDI0KSkgJiAweDAwZmYwMGZmKSB8XG5cdCAgICAgICAgICAgICAgICAgICAgKCgoTTJpMSA8PCAyNCkgfCAoTTJpMSA+Pj4gOCkpICAmIDB4ZmYwMGZmMDApXG5cdCAgICAgICAgICAgICAgICApO1xuXG5cdCAgICAgICAgICAgICAgICAvLyBBYnNvcmIgbWVzc2FnZSBpbnRvIHN0YXRlXG5cdCAgICAgICAgICAgICAgICB2YXIgbGFuZSA9IHN0YXRlW2ldO1xuXHQgICAgICAgICAgICAgICAgbGFuZS5oaWdoIF49IE0yaTE7XG5cdCAgICAgICAgICAgICAgICBsYW5lLmxvdyAgXj0gTTJpO1xuXHQgICAgICAgICAgICB9XG5cblx0ICAgICAgICAgICAgLy8gUm91bmRzXG5cdCAgICAgICAgICAgIGZvciAodmFyIHJvdW5kID0gMDsgcm91bmQgPCAyNDsgcm91bmQrKykge1xuXHQgICAgICAgICAgICAgICAgLy8gVGhldGFcblx0ICAgICAgICAgICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgNTsgeCsrKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgLy8gTWl4IGNvbHVtbiBsYW5lc1xuXHQgICAgICAgICAgICAgICAgICAgIHZhciB0TXN3ID0gMCwgdExzdyA9IDA7XG5cdCAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgeSA9IDA7IHkgPCA1OyB5KyspIHtcblx0ICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGxhbmUgPSBzdGF0ZVt4ICsgNSAqIHldO1xuXHQgICAgICAgICAgICAgICAgICAgICAgICB0TXN3IF49IGxhbmUuaGlnaDtcblx0ICAgICAgICAgICAgICAgICAgICAgICAgdExzdyBePSBsYW5lLmxvdztcblx0ICAgICAgICAgICAgICAgICAgICB9XG5cblx0ICAgICAgICAgICAgICAgICAgICAvLyBUZW1wb3JhcnkgdmFsdWVzXG5cdCAgICAgICAgICAgICAgICAgICAgdmFyIFR4ID0gVFt4XTtcblx0ICAgICAgICAgICAgICAgICAgICBUeC5oaWdoID0gdE1zdztcblx0ICAgICAgICAgICAgICAgICAgICBUeC5sb3cgID0gdExzdztcblx0ICAgICAgICAgICAgICAgIH1cblx0ICAgICAgICAgICAgICAgIGZvciAodmFyIHggPSAwOyB4IDwgNTsgeCsrKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgLy8gU2hvcnRjdXRzXG5cdCAgICAgICAgICAgICAgICAgICAgdmFyIFR4NCA9IFRbKHggKyA0KSAlIDVdO1xuXHQgICAgICAgICAgICAgICAgICAgIHZhciBUeDEgPSBUWyh4ICsgMSkgJSA1XTtcblx0ICAgICAgICAgICAgICAgICAgICB2YXIgVHgxTXN3ID0gVHgxLmhpZ2g7XG5cdCAgICAgICAgICAgICAgICAgICAgdmFyIFR4MUxzdyA9IFR4MS5sb3c7XG5cblx0ICAgICAgICAgICAgICAgICAgICAvLyBNaXggc3Vycm91bmRpbmcgY29sdW1uc1xuXHQgICAgICAgICAgICAgICAgICAgIHZhciB0TXN3ID0gVHg0LmhpZ2ggXiAoKFR4MU1zdyA8PCAxKSB8IChUeDFMc3cgPj4+IDMxKSk7XG5cdCAgICAgICAgICAgICAgICAgICAgdmFyIHRMc3cgPSBUeDQubG93ICBeICgoVHgxTHN3IDw8IDEpIHwgKFR4MU1zdyA+Pj4gMzEpKTtcblx0ICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciB5ID0gMDsgeSA8IDU7IHkrKykge1xuXHQgICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGFuZSA9IHN0YXRlW3ggKyA1ICogeV07XG5cdCAgICAgICAgICAgICAgICAgICAgICAgIGxhbmUuaGlnaCBePSB0TXN3O1xuXHQgICAgICAgICAgICAgICAgICAgICAgICBsYW5lLmxvdyAgXj0gdExzdztcblx0ICAgICAgICAgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgICAgICB9XG5cblx0ICAgICAgICAgICAgICAgIC8vIFJobyBQaVxuXHQgICAgICAgICAgICAgICAgZm9yICh2YXIgbGFuZUluZGV4ID0gMTsgbGFuZUluZGV4IDwgMjU7IGxhbmVJbmRleCsrKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgLy8gU2hvcnRjdXRzXG5cdCAgICAgICAgICAgICAgICAgICAgdmFyIGxhbmUgPSBzdGF0ZVtsYW5lSW5kZXhdO1xuXHQgICAgICAgICAgICAgICAgICAgIHZhciBsYW5lTXN3ID0gbGFuZS5oaWdoO1xuXHQgICAgICAgICAgICAgICAgICAgIHZhciBsYW5lTHN3ID0gbGFuZS5sb3c7XG5cdCAgICAgICAgICAgICAgICAgICAgdmFyIHJob09mZnNldCA9IFJIT19PRkZTRVRTW2xhbmVJbmRleF07XG5cblx0ICAgICAgICAgICAgICAgICAgICAvLyBSb3RhdGUgbGFuZXNcblx0ICAgICAgICAgICAgICAgICAgICBpZiAocmhvT2Zmc2V0IDwgMzIpIHtcblx0ICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHRNc3cgPSAobGFuZU1zdyA8PCByaG9PZmZzZXQpIHwgKGxhbmVMc3cgPj4+ICgzMiAtIHJob09mZnNldCkpO1xuXHQgICAgICAgICAgICAgICAgICAgICAgICB2YXIgdExzdyA9IChsYW5lTHN3IDw8IHJob09mZnNldCkgfCAobGFuZU1zdyA+Pj4gKDMyIC0gcmhvT2Zmc2V0KSk7XG5cdCAgICAgICAgICAgICAgICAgICAgfSBlbHNlIC8qIGlmIChyaG9PZmZzZXQgPj0gMzIpICovIHtcblx0ICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHRNc3cgPSAobGFuZUxzdyA8PCAocmhvT2Zmc2V0IC0gMzIpKSB8IChsYW5lTXN3ID4+PiAoNjQgLSByaG9PZmZzZXQpKTtcblx0ICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHRMc3cgPSAobGFuZU1zdyA8PCAocmhvT2Zmc2V0IC0gMzIpKSB8IChsYW5lTHN3ID4+PiAoNjQgLSByaG9PZmZzZXQpKTtcblx0ICAgICAgICAgICAgICAgICAgICB9XG5cblx0ICAgICAgICAgICAgICAgICAgICAvLyBUcmFuc3Bvc2UgbGFuZXNcblx0ICAgICAgICAgICAgICAgICAgICB2YXIgVFBpTGFuZSA9IFRbUElfSU5ERVhFU1tsYW5lSW5kZXhdXTtcblx0ICAgICAgICAgICAgICAgICAgICBUUGlMYW5lLmhpZ2ggPSB0TXN3O1xuXHQgICAgICAgICAgICAgICAgICAgIFRQaUxhbmUubG93ICA9IHRMc3c7XG5cdCAgICAgICAgICAgICAgICB9XG5cblx0ICAgICAgICAgICAgICAgIC8vIFJobyBwaSBhdCB4ID0geSA9IDBcblx0ICAgICAgICAgICAgICAgIHZhciBUMCA9IFRbMF07XG5cdCAgICAgICAgICAgICAgICB2YXIgc3RhdGUwID0gc3RhdGVbMF07XG5cdCAgICAgICAgICAgICAgICBUMC5oaWdoID0gc3RhdGUwLmhpZ2g7XG5cdCAgICAgICAgICAgICAgICBUMC5sb3cgID0gc3RhdGUwLmxvdztcblxuXHQgICAgICAgICAgICAgICAgLy8gQ2hpXG5cdCAgICAgICAgICAgICAgICBmb3IgKHZhciB4ID0gMDsgeCA8IDU7IHgrKykge1xuXHQgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIHkgPSAwOyB5IDwgNTsgeSsrKSB7XG5cdCAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNob3J0Y3V0c1xuXHQgICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGFuZUluZGV4ID0geCArIDUgKiB5O1xuXHQgICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGFuZSA9IHN0YXRlW2xhbmVJbmRleF07XG5cdCAgICAgICAgICAgICAgICAgICAgICAgIHZhciBUTGFuZSA9IFRbbGFuZUluZGV4XTtcblx0ICAgICAgICAgICAgICAgICAgICAgICAgdmFyIFR4MUxhbmUgPSBUWygoeCArIDEpICUgNSkgKyA1ICogeV07XG5cdCAgICAgICAgICAgICAgICAgICAgICAgIHZhciBUeDJMYW5lID0gVFsoKHggKyAyKSAlIDUpICsgNSAqIHldO1xuXG5cdCAgICAgICAgICAgICAgICAgICAgICAgIC8vIE1peCByb3dzXG5cdCAgICAgICAgICAgICAgICAgICAgICAgIGxhbmUuaGlnaCA9IFRMYW5lLmhpZ2ggXiAoflR4MUxhbmUuaGlnaCAmIFR4MkxhbmUuaGlnaCk7XG5cdCAgICAgICAgICAgICAgICAgICAgICAgIGxhbmUubG93ICA9IFRMYW5lLmxvdyAgXiAoflR4MUxhbmUubG93ICAmIFR4MkxhbmUubG93KTtcblx0ICAgICAgICAgICAgICAgICAgICB9XG5cdCAgICAgICAgICAgICAgICB9XG5cblx0ICAgICAgICAgICAgICAgIC8vIElvdGFcblx0ICAgICAgICAgICAgICAgIHZhciBsYW5lID0gc3RhdGVbMF07XG5cdCAgICAgICAgICAgICAgICB2YXIgcm91bmRDb25zdGFudCA9IFJPVU5EX0NPTlNUQU5UU1tyb3VuZF07XG5cdCAgICAgICAgICAgICAgICBsYW5lLmhpZ2ggXj0gcm91bmRDb25zdGFudC5oaWdoO1xuXHQgICAgICAgICAgICAgICAgbGFuZS5sb3cgIF49IHJvdW5kQ29uc3RhbnQubG93Oztcblx0ICAgICAgICAgICAgfVxuXHQgICAgICAgIH0sXG5cblx0ICAgICAgICBfZG9GaW5hbGl6ZTogZnVuY3Rpb24gKCkge1xuXHQgICAgICAgICAgICAvLyBTaG9ydGN1dHNcblx0ICAgICAgICAgICAgdmFyIGRhdGEgPSB0aGlzLl9kYXRhO1xuXHQgICAgICAgICAgICB2YXIgZGF0YVdvcmRzID0gZGF0YS53b3Jkcztcblx0ICAgICAgICAgICAgdmFyIG5CaXRzVG90YWwgPSB0aGlzLl9uRGF0YUJ5dGVzICogODtcblx0ICAgICAgICAgICAgdmFyIG5CaXRzTGVmdCA9IGRhdGEuc2lnQnl0ZXMgKiA4O1xuXHQgICAgICAgICAgICB2YXIgYmxvY2tTaXplQml0cyA9IHRoaXMuYmxvY2tTaXplICogMzI7XG5cblx0ICAgICAgICAgICAgLy8gQWRkIHBhZGRpbmdcblx0ICAgICAgICAgICAgZGF0YVdvcmRzW25CaXRzTGVmdCA+Pj4gNV0gfD0gMHgxIDw8ICgyNCAtIG5CaXRzTGVmdCAlIDMyKTtcblx0ICAgICAgICAgICAgZGF0YVdvcmRzWygoTWF0aC5jZWlsKChuQml0c0xlZnQgKyAxKSAvIGJsb2NrU2l6ZUJpdHMpICogYmxvY2tTaXplQml0cykgPj4+IDUpIC0gMV0gfD0gMHg4MDtcblx0ICAgICAgICAgICAgZGF0YS5zaWdCeXRlcyA9IGRhdGFXb3Jkcy5sZW5ndGggKiA0O1xuXG5cdCAgICAgICAgICAgIC8vIEhhc2ggZmluYWwgYmxvY2tzXG5cdCAgICAgICAgICAgIHRoaXMuX3Byb2Nlc3MoKTtcblxuXHQgICAgICAgICAgICAvLyBTaG9ydGN1dHNcblx0ICAgICAgICAgICAgdmFyIHN0YXRlID0gdGhpcy5fc3RhdGU7XG5cdCAgICAgICAgICAgIHZhciBvdXRwdXRMZW5ndGhCeXRlcyA9IHRoaXMuY2ZnLm91dHB1dExlbmd0aCAvIDg7XG5cdCAgICAgICAgICAgIHZhciBvdXRwdXRMZW5ndGhMYW5lcyA9IG91dHB1dExlbmd0aEJ5dGVzIC8gODtcblxuXHQgICAgICAgICAgICAvLyBTcXVlZXplXG5cdCAgICAgICAgICAgIHZhciBoYXNoV29yZHMgPSBbXTtcblx0ICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBvdXRwdXRMZW5ndGhMYW5lczsgaSsrKSB7XG5cdCAgICAgICAgICAgICAgICAvLyBTaG9ydGN1dHNcblx0ICAgICAgICAgICAgICAgIHZhciBsYW5lID0gc3RhdGVbaV07XG5cdCAgICAgICAgICAgICAgICB2YXIgbGFuZU1zdyA9IGxhbmUuaGlnaDtcblx0ICAgICAgICAgICAgICAgIHZhciBsYW5lTHN3ID0gbGFuZS5sb3c7XG5cblx0ICAgICAgICAgICAgICAgIC8vIFN3YXAgZW5kaWFuXG5cdCAgICAgICAgICAgICAgICBsYW5lTXN3ID0gKFxuXHQgICAgICAgICAgICAgICAgICAgICgoKGxhbmVNc3cgPDwgOCkgIHwgKGxhbmVNc3cgPj4+IDI0KSkgJiAweDAwZmYwMGZmKSB8XG5cdCAgICAgICAgICAgICAgICAgICAgKCgobGFuZU1zdyA8PCAyNCkgfCAobGFuZU1zdyA+Pj4gOCkpICAmIDB4ZmYwMGZmMDApXG5cdCAgICAgICAgICAgICAgICApO1xuXHQgICAgICAgICAgICAgICAgbGFuZUxzdyA9IChcblx0ICAgICAgICAgICAgICAgICAgICAoKChsYW5lTHN3IDw8IDgpICB8IChsYW5lTHN3ID4+PiAyNCkpICYgMHgwMGZmMDBmZikgfFxuXHQgICAgICAgICAgICAgICAgICAgICgoKGxhbmVMc3cgPDwgMjQpIHwgKGxhbmVMc3cgPj4+IDgpKSAgJiAweGZmMDBmZjAwKVxuXHQgICAgICAgICAgICAgICAgKTtcblxuXHQgICAgICAgICAgICAgICAgLy8gU3F1ZWV6ZSBzdGF0ZSB0byByZXRyaWV2ZSBoYXNoXG5cdCAgICAgICAgICAgICAgICBoYXNoV29yZHMucHVzaChsYW5lTHN3KTtcblx0ICAgICAgICAgICAgICAgIGhhc2hXb3Jkcy5wdXNoKGxhbmVNc3cpO1xuXHQgICAgICAgICAgICB9XG5cblx0ICAgICAgICAgICAgLy8gUmV0dXJuIGZpbmFsIGNvbXB1dGVkIGhhc2hcblx0ICAgICAgICAgICAgcmV0dXJuIG5ldyBXb3JkQXJyYXkuaW5pdChoYXNoV29yZHMsIG91dHB1dExlbmd0aEJ5dGVzKTtcblx0ICAgICAgICB9LFxuXG5cdCAgICAgICAgY2xvbmU6IGZ1bmN0aW9uICgpIHtcblx0ICAgICAgICAgICAgdmFyIGNsb25lID0gSGFzaGVyLmNsb25lLmNhbGwodGhpcyk7XG5cblx0ICAgICAgICAgICAgdmFyIHN0YXRlID0gY2xvbmUuX3N0YXRlID0gdGhpcy5fc3RhdGUuc2xpY2UoMCk7XG5cdCAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgMjU7IGkrKykge1xuXHQgICAgICAgICAgICAgICAgc3RhdGVbaV0gPSBzdGF0ZVtpXS5jbG9uZSgpO1xuXHQgICAgICAgICAgICB9XG5cblx0ICAgICAgICAgICAgcmV0dXJuIGNsb25lO1xuXHQgICAgICAgIH1cblx0ICAgIH0pO1xuXG5cdCAgICAvKipcblx0ICAgICAqIFNob3J0Y3V0IGZ1bmN0aW9uIHRvIHRoZSBoYXNoZXIncyBvYmplY3QgaW50ZXJmYWNlLlxuXHQgICAgICpcblx0ICAgICAqIEBwYXJhbSB7V29yZEFycmF5fHN0cmluZ30gbWVzc2FnZSBUaGUgbWVzc2FnZSB0byBoYXNoLlxuXHQgICAgICpcblx0ICAgICAqIEByZXR1cm4ge1dvcmRBcnJheX0gVGhlIGhhc2guXG5cdCAgICAgKlxuXHQgICAgICogQHN0YXRpY1xuXHQgICAgICpcblx0ICAgICAqIEBleGFtcGxlXG5cdCAgICAgKlxuXHQgICAgICogICAgIHZhciBoYXNoID0gQ3J5cHRvSlMuU0hBMygnbWVzc2FnZScpO1xuXHQgICAgICogICAgIHZhciBoYXNoID0gQ3J5cHRvSlMuU0hBMyh3b3JkQXJyYXkpO1xuXHQgICAgICovXG5cdCAgICBDLlNIQTMgPSBIYXNoZXIuX2NyZWF0ZUhlbHBlcihTSEEzKTtcblxuXHQgICAgLyoqXG5cdCAgICAgKiBTaG9ydGN1dCBmdW5jdGlvbiB0byB0aGUgSE1BQydzIG9iamVjdCBpbnRlcmZhY2UuXG5cdCAgICAgKlxuXHQgICAgICogQHBhcmFtIHtXb3JkQXJyYXl8c3RyaW5nfSBtZXNzYWdlIFRoZSBtZXNzYWdlIHRvIGhhc2guXG5cdCAgICAgKiBAcGFyYW0ge1dvcmRBcnJheXxzdHJpbmd9IGtleSBUaGUgc2VjcmV0IGtleS5cblx0ICAgICAqXG5cdCAgICAgKiBAcmV0dXJuIHtXb3JkQXJyYXl9IFRoZSBITUFDLlxuXHQgICAgICpcblx0ICAgICAqIEBzdGF0aWNcblx0ICAgICAqXG5cdCAgICAgKiBAZXhhbXBsZVxuXHQgICAgICpcblx0ICAgICAqICAgICB2YXIgaG1hYyA9IENyeXB0b0pTLkhtYWNTSEEzKG1lc3NhZ2UsIGtleSk7XG5cdCAgICAgKi9cblx0ICAgIEMuSG1hY1NIQTMgPSBIYXNoZXIuX2NyZWF0ZUhtYWNIZWxwZXIoU0hBMyk7XG5cdH0oTWF0aCkpO1xuXG5cblx0cmV0dXJuIENyeXB0b0pTLlNIQTM7XG5cbn0pKTsiLCI7KGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XG5cdGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gXCJvYmplY3RcIikge1xuXHRcdC8vIENvbW1vbkpTXG5cdFx0bW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzID0gZmFjdG9yeShyZXF1aXJlKFwiLi9jb3JlXCIpKTtcblx0fVxuXHRlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSBcImZ1bmN0aW9uXCIgJiYgZGVmaW5lLmFtZCkge1xuXHRcdC8vIEFNRFxuXHRcdGRlZmluZShbXCIuL2NvcmVcIl0sIGZhY3RvcnkpO1xuXHR9XG5cdGVsc2Uge1xuXHRcdC8vIEdsb2JhbCAoYnJvd3Nlcilcblx0XHRmYWN0b3J5KHJvb3QuQ3J5cHRvSlMpO1xuXHR9XG59KHRoaXMsIGZ1bmN0aW9uIChDcnlwdG9KUykge1xuXG5cdChmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5cdCAgICAvLyBTaG9ydGN1dHNcblx0ICAgIHZhciBDID0gQ3J5cHRvSlM7XG5cdCAgICB2YXIgQ19saWIgPSBDLmxpYjtcblx0ICAgIHZhciBCYXNlID0gQ19saWIuQmFzZTtcblx0ICAgIHZhciBYMzJXb3JkQXJyYXkgPSBDX2xpYi5Xb3JkQXJyYXk7XG5cblx0ICAgIC8qKlxuXHQgICAgICogeDY0IG5hbWVzcGFjZS5cblx0ICAgICAqL1xuXHQgICAgdmFyIENfeDY0ID0gQy54NjQgPSB7fTtcblxuXHQgICAgLyoqXG5cdCAgICAgKiBBIDY0LWJpdCB3b3JkLlxuXHQgICAgICovXG5cdCAgICB2YXIgWDY0V29yZCA9IENfeDY0LldvcmQgPSBCYXNlLmV4dGVuZCh7XG5cdCAgICAgICAgLyoqXG5cdCAgICAgICAgICogSW5pdGlhbGl6ZXMgYSBuZXdseSBjcmVhdGVkIDY0LWJpdCB3b3JkLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHBhcmFtIHtudW1iZXJ9IGhpZ2ggVGhlIGhpZ2ggMzIgYml0cy5cblx0ICAgICAgICAgKiBAcGFyYW0ge251bWJlcn0gbG93IFRoZSBsb3cgMzIgYml0cy5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgdmFyIHg2NFdvcmQgPSBDcnlwdG9KUy54NjQuV29yZC5jcmVhdGUoMHgwMDAxMDIwMywgMHgwNDA1MDYwNyk7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgaW5pdDogZnVuY3Rpb24gKGhpZ2gsIGxvdykge1xuXHQgICAgICAgICAgICB0aGlzLmhpZ2ggPSBoaWdoO1xuXHQgICAgICAgICAgICB0aGlzLmxvdyA9IGxvdztcblx0ICAgICAgICB9XG5cblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBCaXR3aXNlIE5PVHMgdGhpcyB3b3JkLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHJldHVybiB7WDY0V29yZH0gQSBuZXcgeDY0LVdvcmQgb2JqZWN0IGFmdGVyIG5lZ2F0aW5nLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgbmVnYXRlZCA9IHg2NFdvcmQubm90KCk7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgLy8gbm90OiBmdW5jdGlvbiAoKSB7XG5cdCAgICAgICAgICAgIC8vIHZhciBoaWdoID0gfnRoaXMuaGlnaDtcblx0ICAgICAgICAgICAgLy8gdmFyIGxvdyA9IH50aGlzLmxvdztcblxuXHQgICAgICAgICAgICAvLyByZXR1cm4gWDY0V29yZC5jcmVhdGUoaGlnaCwgbG93KTtcblx0ICAgICAgICAvLyB9LFxuXG5cdCAgICAgICAgLyoqXG5cdCAgICAgICAgICogQml0d2lzZSBBTkRzIHRoaXMgd29yZCB3aXRoIHRoZSBwYXNzZWQgd29yZC5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBwYXJhbSB7WDY0V29yZH0gd29yZCBUaGUgeDY0LVdvcmQgdG8gQU5EIHdpdGggdGhpcyB3b3JkLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHJldHVybiB7WDY0V29yZH0gQSBuZXcgeDY0LVdvcmQgb2JqZWN0IGFmdGVyIEFORGluZy5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgdmFyIGFuZGVkID0geDY0V29yZC5hbmQoYW5vdGhlclg2NFdvcmQpO1xuXHQgICAgICAgICAqL1xuXHQgICAgICAgIC8vIGFuZDogZnVuY3Rpb24gKHdvcmQpIHtcblx0ICAgICAgICAgICAgLy8gdmFyIGhpZ2ggPSB0aGlzLmhpZ2ggJiB3b3JkLmhpZ2g7XG5cdCAgICAgICAgICAgIC8vIHZhciBsb3cgPSB0aGlzLmxvdyAmIHdvcmQubG93O1xuXG5cdCAgICAgICAgICAgIC8vIHJldHVybiBYNjRXb3JkLmNyZWF0ZShoaWdoLCBsb3cpO1xuXHQgICAgICAgIC8vIH0sXG5cblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBCaXR3aXNlIE9ScyB0aGlzIHdvcmQgd2l0aCB0aGUgcGFzc2VkIHdvcmQuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcGFyYW0ge1g2NFdvcmR9IHdvcmQgVGhlIHg2NC1Xb3JkIHRvIE9SIHdpdGggdGhpcyB3b3JkLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHJldHVybiB7WDY0V29yZH0gQSBuZXcgeDY0LVdvcmQgb2JqZWN0IGFmdGVyIE9SaW5nLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgb3JlZCA9IHg2NFdvcmQub3IoYW5vdGhlclg2NFdvcmQpO1xuXHQgICAgICAgICAqL1xuXHQgICAgICAgIC8vIG9yOiBmdW5jdGlvbiAod29yZCkge1xuXHQgICAgICAgICAgICAvLyB2YXIgaGlnaCA9IHRoaXMuaGlnaCB8IHdvcmQuaGlnaDtcblx0ICAgICAgICAgICAgLy8gdmFyIGxvdyA9IHRoaXMubG93IHwgd29yZC5sb3c7XG5cblx0ICAgICAgICAgICAgLy8gcmV0dXJuIFg2NFdvcmQuY3JlYXRlKGhpZ2gsIGxvdyk7XG5cdCAgICAgICAgLy8gfSxcblxuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIEJpdHdpc2UgWE9ScyB0aGlzIHdvcmQgd2l0aCB0aGUgcGFzc2VkIHdvcmQuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcGFyYW0ge1g2NFdvcmR9IHdvcmQgVGhlIHg2NC1Xb3JkIHRvIFhPUiB3aXRoIHRoaXMgd29yZC5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEByZXR1cm4ge1g2NFdvcmR9IEEgbmV3IHg2NC1Xb3JkIG9iamVjdCBhZnRlciBYT1JpbmcuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAZXhhbXBsZVxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogICAgIHZhciB4b3JlZCA9IHg2NFdvcmQueG9yKGFub3RoZXJYNjRXb3JkKTtcblx0ICAgICAgICAgKi9cblx0ICAgICAgICAvLyB4b3I6IGZ1bmN0aW9uICh3b3JkKSB7XG5cdCAgICAgICAgICAgIC8vIHZhciBoaWdoID0gdGhpcy5oaWdoIF4gd29yZC5oaWdoO1xuXHQgICAgICAgICAgICAvLyB2YXIgbG93ID0gdGhpcy5sb3cgXiB3b3JkLmxvdztcblxuXHQgICAgICAgICAgICAvLyByZXR1cm4gWDY0V29yZC5jcmVhdGUoaGlnaCwgbG93KTtcblx0ICAgICAgICAvLyB9LFxuXG5cdCAgICAgICAgLyoqXG5cdCAgICAgICAgICogU2hpZnRzIHRoaXMgd29yZCBuIGJpdHMgdG8gdGhlIGxlZnQuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcGFyYW0ge251bWJlcn0gbiBUaGUgbnVtYmVyIG9mIGJpdHMgdG8gc2hpZnQuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcmV0dXJuIHtYNjRXb3JkfSBBIG5ldyB4NjQtV29yZCBvYmplY3QgYWZ0ZXIgc2hpZnRpbmcuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAZXhhbXBsZVxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogICAgIHZhciBzaGlmdGVkID0geDY0V29yZC5zaGlmdEwoMjUpO1xuXHQgICAgICAgICAqL1xuXHQgICAgICAgIC8vIHNoaWZ0TDogZnVuY3Rpb24gKG4pIHtcblx0ICAgICAgICAgICAgLy8gaWYgKG4gPCAzMikge1xuXHQgICAgICAgICAgICAgICAgLy8gdmFyIGhpZ2ggPSAodGhpcy5oaWdoIDw8IG4pIHwgKHRoaXMubG93ID4+PiAoMzIgLSBuKSk7XG5cdCAgICAgICAgICAgICAgICAvLyB2YXIgbG93ID0gdGhpcy5sb3cgPDwgbjtcblx0ICAgICAgICAgICAgLy8gfSBlbHNlIHtcblx0ICAgICAgICAgICAgICAgIC8vIHZhciBoaWdoID0gdGhpcy5sb3cgPDwgKG4gLSAzMik7XG5cdCAgICAgICAgICAgICAgICAvLyB2YXIgbG93ID0gMDtcblx0ICAgICAgICAgICAgLy8gfVxuXG5cdCAgICAgICAgICAgIC8vIHJldHVybiBYNjRXb3JkLmNyZWF0ZShoaWdoLCBsb3cpO1xuXHQgICAgICAgIC8vIH0sXG5cblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBTaGlmdHMgdGhpcyB3b3JkIG4gYml0cyB0byB0aGUgcmlnaHQuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcGFyYW0ge251bWJlcn0gbiBUaGUgbnVtYmVyIG9mIGJpdHMgdG8gc2hpZnQuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcmV0dXJuIHtYNjRXb3JkfSBBIG5ldyB4NjQtV29yZCBvYmplY3QgYWZ0ZXIgc2hpZnRpbmcuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAZXhhbXBsZVxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogICAgIHZhciBzaGlmdGVkID0geDY0V29yZC5zaGlmdFIoNyk7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgLy8gc2hpZnRSOiBmdW5jdGlvbiAobikge1xuXHQgICAgICAgICAgICAvLyBpZiAobiA8IDMyKSB7XG5cdCAgICAgICAgICAgICAgICAvLyB2YXIgbG93ID0gKHRoaXMubG93ID4+PiBuKSB8ICh0aGlzLmhpZ2ggPDwgKDMyIC0gbikpO1xuXHQgICAgICAgICAgICAgICAgLy8gdmFyIGhpZ2ggPSB0aGlzLmhpZ2ggPj4+IG47XG5cdCAgICAgICAgICAgIC8vIH0gZWxzZSB7XG5cdCAgICAgICAgICAgICAgICAvLyB2YXIgbG93ID0gdGhpcy5oaWdoID4+PiAobiAtIDMyKTtcblx0ICAgICAgICAgICAgICAgIC8vIHZhciBoaWdoID0gMDtcblx0ICAgICAgICAgICAgLy8gfVxuXG5cdCAgICAgICAgICAgIC8vIHJldHVybiBYNjRXb3JkLmNyZWF0ZShoaWdoLCBsb3cpO1xuXHQgICAgICAgIC8vIH0sXG5cblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBSb3RhdGVzIHRoaXMgd29yZCBuIGJpdHMgdG8gdGhlIGxlZnQuXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiBAcGFyYW0ge251bWJlcn0gbiBUaGUgbnVtYmVyIG9mIGJpdHMgdG8gcm90YXRlLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHJldHVybiB7WDY0V29yZH0gQSBuZXcgeDY0LVdvcmQgb2JqZWN0IGFmdGVyIHJvdGF0aW5nLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgcm90YXRlZCA9IHg2NFdvcmQucm90TCgyNSk7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgLy8gcm90TDogZnVuY3Rpb24gKG4pIHtcblx0ICAgICAgICAgICAgLy8gcmV0dXJuIHRoaXMuc2hpZnRMKG4pLm9yKHRoaXMuc2hpZnRSKDY0IC0gbikpO1xuXHQgICAgICAgIC8vIH0sXG5cblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBSb3RhdGVzIHRoaXMgd29yZCBuIGJpdHMgdG8gdGhlIHJpZ2h0LlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHBhcmFtIHtudW1iZXJ9IG4gVGhlIG51bWJlciBvZiBiaXRzIHRvIHJvdGF0ZS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEByZXR1cm4ge1g2NFdvcmR9IEEgbmV3IHg2NC1Xb3JkIG9iamVjdCBhZnRlciByb3RhdGluZy5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgdmFyIHJvdGF0ZWQgPSB4NjRXb3JkLnJvdFIoNyk7XG5cdCAgICAgICAgICovXG5cdCAgICAgICAgLy8gcm90UjogZnVuY3Rpb24gKG4pIHtcblx0ICAgICAgICAgICAgLy8gcmV0dXJuIHRoaXMuc2hpZnRSKG4pLm9yKHRoaXMuc2hpZnRMKDY0IC0gbikpO1xuXHQgICAgICAgIC8vIH0sXG5cblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBBZGRzIHRoaXMgd29yZCB3aXRoIHRoZSBwYXNzZWQgd29yZC5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBwYXJhbSB7WDY0V29yZH0gd29yZCBUaGUgeDY0LVdvcmQgdG8gYWRkIHdpdGggdGhpcyB3b3JkLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQHJldHVybiB7WDY0V29yZH0gQSBuZXcgeDY0LVdvcmQgb2JqZWN0IGFmdGVyIGFkZGluZy5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgdmFyIGFkZGVkID0geDY0V29yZC5hZGQoYW5vdGhlclg2NFdvcmQpO1xuXHQgICAgICAgICAqL1xuXHQgICAgICAgIC8vIGFkZDogZnVuY3Rpb24gKHdvcmQpIHtcblx0ICAgICAgICAgICAgLy8gdmFyIGxvdyA9ICh0aGlzLmxvdyArIHdvcmQubG93KSB8IDA7XG5cdCAgICAgICAgICAgIC8vIHZhciBjYXJyeSA9IChsb3cgPj4+IDApIDwgKHRoaXMubG93ID4+PiAwKSA/IDEgOiAwO1xuXHQgICAgICAgICAgICAvLyB2YXIgaGlnaCA9ICh0aGlzLmhpZ2ggKyB3b3JkLmhpZ2ggKyBjYXJyeSkgfCAwO1xuXG5cdCAgICAgICAgICAgIC8vIHJldHVybiBYNjRXb3JkLmNyZWF0ZShoaWdoLCBsb3cpO1xuXHQgICAgICAgIC8vIH1cblx0ICAgIH0pO1xuXG5cdCAgICAvKipcblx0ICAgICAqIEFuIGFycmF5IG9mIDY0LWJpdCB3b3Jkcy5cblx0ICAgICAqXG5cdCAgICAgKiBAcHJvcGVydHkge0FycmF5fSB3b3JkcyBUaGUgYXJyYXkgb2YgQ3J5cHRvSlMueDY0LldvcmQgb2JqZWN0cy5cblx0ICAgICAqIEBwcm9wZXJ0eSB7bnVtYmVyfSBzaWdCeXRlcyBUaGUgbnVtYmVyIG9mIHNpZ25pZmljYW50IGJ5dGVzIGluIHRoaXMgd29yZCBhcnJheS5cblx0ICAgICAqL1xuXHQgICAgdmFyIFg2NFdvcmRBcnJheSA9IENfeDY0LldvcmRBcnJheSA9IEJhc2UuZXh0ZW5kKHtcblx0ICAgICAgICAvKipcblx0ICAgICAgICAgKiBJbml0aWFsaXplcyBhIG5ld2x5IGNyZWF0ZWQgd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBwYXJhbSB7QXJyYXl9IHdvcmRzIChPcHRpb25hbCkgQW4gYXJyYXkgb2YgQ3J5cHRvSlMueDY0LldvcmQgb2JqZWN0cy5cblx0ICAgICAgICAgKiBAcGFyYW0ge251bWJlcn0gc2lnQnl0ZXMgKE9wdGlvbmFsKSBUaGUgbnVtYmVyIG9mIHNpZ25pZmljYW50IGJ5dGVzIGluIHRoZSB3b3Jkcy5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgdmFyIHdvcmRBcnJheSA9IENyeXB0b0pTLng2NC5Xb3JkQXJyYXkuY3JlYXRlKCk7XG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgdmFyIHdvcmRBcnJheSA9IENyeXB0b0pTLng2NC5Xb3JkQXJyYXkuY3JlYXRlKFtcblx0ICAgICAgICAgKiAgICAgICAgIENyeXB0b0pTLng2NC5Xb3JkLmNyZWF0ZSgweDAwMDEwMjAzLCAweDA0MDUwNjA3KSxcblx0ICAgICAgICAgKiAgICAgICAgIENyeXB0b0pTLng2NC5Xb3JkLmNyZWF0ZSgweDE4MTkxYTFiLCAweDFjMWQxZTFmKVxuXHQgICAgICAgICAqICAgICBdKTtcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgd29yZEFycmF5ID0gQ3J5cHRvSlMueDY0LldvcmRBcnJheS5jcmVhdGUoW1xuXHQgICAgICAgICAqICAgICAgICAgQ3J5cHRvSlMueDY0LldvcmQuY3JlYXRlKDB4MDAwMTAyMDMsIDB4MDQwNTA2MDcpLFxuXHQgICAgICAgICAqICAgICAgICAgQ3J5cHRvSlMueDY0LldvcmQuY3JlYXRlKDB4MTgxOTFhMWIsIDB4MWMxZDFlMWYpXG5cdCAgICAgICAgICogICAgIF0sIDEwKTtcblx0ICAgICAgICAgKi9cblx0ICAgICAgICBpbml0OiBmdW5jdGlvbiAod29yZHMsIHNpZ0J5dGVzKSB7XG5cdCAgICAgICAgICAgIHdvcmRzID0gdGhpcy53b3JkcyA9IHdvcmRzIHx8IFtdO1xuXG5cdCAgICAgICAgICAgIGlmIChzaWdCeXRlcyAhPSB1bmRlZmluZWQpIHtcblx0ICAgICAgICAgICAgICAgIHRoaXMuc2lnQnl0ZXMgPSBzaWdCeXRlcztcblx0ICAgICAgICAgICAgfSBlbHNlIHtcblx0ICAgICAgICAgICAgICAgIHRoaXMuc2lnQnl0ZXMgPSB3b3Jkcy5sZW5ndGggKiA4O1xuXHQgICAgICAgICAgICB9XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIENvbnZlcnRzIHRoaXMgNjQtYml0IHdvcmQgYXJyYXkgdG8gYSAzMi1iaXQgd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEByZXR1cm4ge0NyeXB0b0pTLmxpYi5Xb3JkQXJyYXl9IFRoaXMgd29yZCBhcnJheSdzIGRhdGEgYXMgYSAzMi1iaXQgd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEBleGFtcGxlXG5cdCAgICAgICAgICpcblx0ICAgICAgICAgKiAgICAgdmFyIHgzMldvcmRBcnJheSA9IHg2NFdvcmRBcnJheS50b1gzMigpO1xuXHQgICAgICAgICAqL1xuXHQgICAgICAgIHRvWDMyOiBmdW5jdGlvbiAoKSB7XG5cdCAgICAgICAgICAgIC8vIFNob3J0Y3V0c1xuXHQgICAgICAgICAgICB2YXIgeDY0V29yZHMgPSB0aGlzLndvcmRzO1xuXHQgICAgICAgICAgICB2YXIgeDY0V29yZHNMZW5ndGggPSB4NjRXb3Jkcy5sZW5ndGg7XG5cblx0ICAgICAgICAgICAgLy8gQ29udmVydFxuXHQgICAgICAgICAgICB2YXIgeDMyV29yZHMgPSBbXTtcblx0ICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB4NjRXb3Jkc0xlbmd0aDsgaSsrKSB7XG5cdCAgICAgICAgICAgICAgICB2YXIgeDY0V29yZCA9IHg2NFdvcmRzW2ldO1xuXHQgICAgICAgICAgICAgICAgeDMyV29yZHMucHVzaCh4NjRXb3JkLmhpZ2gpO1xuXHQgICAgICAgICAgICAgICAgeDMyV29yZHMucHVzaCh4NjRXb3JkLmxvdyk7XG5cdCAgICAgICAgICAgIH1cblxuXHQgICAgICAgICAgICByZXR1cm4gWDMyV29yZEFycmF5LmNyZWF0ZSh4MzJXb3JkcywgdGhpcy5zaWdCeXRlcyk7XG5cdCAgICAgICAgfSxcblxuXHQgICAgICAgIC8qKlxuXHQgICAgICAgICAqIENyZWF0ZXMgYSBjb3B5IG9mIHRoaXMgd29yZCBhcnJheS5cblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqIEByZXR1cm4ge1g2NFdvcmRBcnJheX0gVGhlIGNsb25lLlxuXHQgICAgICAgICAqXG5cdCAgICAgICAgICogQGV4YW1wbGVcblx0ICAgICAgICAgKlxuXHQgICAgICAgICAqICAgICB2YXIgY2xvbmUgPSB4NjRXb3JkQXJyYXkuY2xvbmUoKTtcblx0ICAgICAgICAgKi9cblx0ICAgICAgICBjbG9uZTogZnVuY3Rpb24gKCkge1xuXHQgICAgICAgICAgICB2YXIgY2xvbmUgPSBCYXNlLmNsb25lLmNhbGwodGhpcyk7XG5cblx0ICAgICAgICAgICAgLy8gQ2xvbmUgXCJ3b3Jkc1wiIGFycmF5XG5cdCAgICAgICAgICAgIHZhciB3b3JkcyA9IGNsb25lLndvcmRzID0gdGhpcy53b3Jkcy5zbGljZSgwKTtcblxuXHQgICAgICAgICAgICAvLyBDbG9uZSBlYWNoIFg2NFdvcmQgb2JqZWN0XG5cdCAgICAgICAgICAgIHZhciB3b3Jkc0xlbmd0aCA9IHdvcmRzLmxlbmd0aDtcblx0ICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB3b3Jkc0xlbmd0aDsgaSsrKSB7XG5cdCAgICAgICAgICAgICAgICB3b3Jkc1tpXSA9IHdvcmRzW2ldLmNsb25lKCk7XG5cdCAgICAgICAgICAgIH1cblxuXHQgICAgICAgICAgICByZXR1cm4gY2xvbmU7XG5cdCAgICAgICAgfVxuXHQgICAgfSk7XG5cdH0oKSk7XG5cblxuXHRyZXR1cm4gQ3J5cHRvSlM7XG5cbn0pKTsiLCIvKiEgYmlnbnVtYmVyLmpzIHYyLjAuNyBodHRwczovL2dpdGh1Yi5jb20vTWlrZU1jbC9iaWdudW1iZXIuanMvTElDRU5DRSAqL1xuXG47KGZ1bmN0aW9uIChnbG9iYWwpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvKlxuICAgICAgYmlnbnVtYmVyLmpzIHYyLjAuN1xuICAgICAgQSBKYXZhU2NyaXB0IGxpYnJhcnkgZm9yIGFyYml0cmFyeS1wcmVjaXNpb24gYXJpdGhtZXRpYy5cbiAgICAgIGh0dHBzOi8vZ2l0aHViLmNvbS9NaWtlTWNsL2JpZ251bWJlci5qc1xuICAgICAgQ29weXJpZ2h0IChjKSAyMDE1IE1pY2hhZWwgTWNsYXVnaGxpbiA8TThjaDg4bEBnbWFpbC5jb20+XG4gICAgICBNSVQgRXhwYXQgTGljZW5jZVxuICAgICovXG5cblxuICAgIHZhciBCaWdOdW1iZXIsIGNyeXB0bywgcGFyc2VOdW1lcmljLFxuICAgICAgICBpc051bWVyaWMgPSAvXi0/KFxcZCsoXFwuXFxkKik/fFxcLlxcZCspKGVbKy1dP1xcZCspPyQvaSxcbiAgICAgICAgbWF0aGNlaWwgPSBNYXRoLmNlaWwsXG4gICAgICAgIG1hdGhmbG9vciA9IE1hdGguZmxvb3IsXG4gICAgICAgIG5vdEJvb2wgPSAnIG5vdCBhIGJvb2xlYW4gb3IgYmluYXJ5IGRpZ2l0JyxcbiAgICAgICAgcm91bmRpbmdNb2RlID0gJ3JvdW5kaW5nIG1vZGUnLFxuICAgICAgICB0b29NYW55RGlnaXRzID0gJ251bWJlciB0eXBlIGhhcyBtb3JlIHRoYW4gMTUgc2lnbmlmaWNhbnQgZGlnaXRzJyxcbiAgICAgICAgQUxQSEFCRVQgPSAnMDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVokXycsXG4gICAgICAgIEJBU0UgPSAxZTE0LFxuICAgICAgICBMT0dfQkFTRSA9IDE0LFxuICAgICAgICBNQVhfU0FGRV9JTlRFR0VSID0gMHgxZmZmZmZmZmZmZmZmZiwgICAgICAgICAvLyAyXjUzIC0gMVxuICAgICAgICAvLyBNQVhfSU5UMzIgPSAweDdmZmZmZmZmLCAgICAgICAgICAgICAgICAgICAvLyAyXjMxIC0gMVxuICAgICAgICBQT1dTX1RFTiA9IFsxLCAxMCwgMTAwLCAxZTMsIDFlNCwgMWU1LCAxZTYsIDFlNywgMWU4LCAxZTksIDFlMTAsIDFlMTEsIDFlMTIsIDFlMTNdLFxuICAgICAgICBTUVJUX0JBU0UgPSAxZTcsXG5cbiAgICAgICAgLypcbiAgICAgICAgICogVGhlIGxpbWl0IG9uIHRoZSB2YWx1ZSBvZiBERUNJTUFMX1BMQUNFUywgVE9fRVhQX05FRywgVE9fRVhQX1BPUywgTUlOX0VYUCwgTUFYX0VYUCwgYW5kXG4gICAgICAgICAqIHRoZSBhcmd1bWVudHMgdG8gdG9FeHBvbmVudGlhbCwgdG9GaXhlZCwgdG9Gb3JtYXQsIGFuZCB0b1ByZWNpc2lvbiwgYmV5b25kIHdoaWNoIGFuXG4gICAgICAgICAqIGV4Y2VwdGlvbiBpcyB0aHJvd24gKGlmIEVSUk9SUyBpcyB0cnVlKS5cbiAgICAgICAgICovXG4gICAgICAgIE1BWCA9IDFFOTsgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDAgdG8gTUFYX0lOVDMyXG5cblxuICAgIC8qXG4gICAgICogQ3JlYXRlIGFuZCByZXR1cm4gYSBCaWdOdW1iZXIgY29uc3RydWN0b3IuXG4gICAgICovXG4gICAgZnVuY3Rpb24gYW5vdGhlcihjb25maWdPYmopIHtcbiAgICAgICAgdmFyIGRpdixcblxuICAgICAgICAgICAgLy8gaWQgdHJhY2tzIHRoZSBjYWxsZXIgZnVuY3Rpb24sIHNvIGl0cyBuYW1lIGNhbiBiZSBpbmNsdWRlZCBpbiBlcnJvciBtZXNzYWdlcy5cbiAgICAgICAgICAgIGlkID0gMCxcbiAgICAgICAgICAgIFAgPSBCaWdOdW1iZXIucHJvdG90eXBlLFxuICAgICAgICAgICAgT05FID0gbmV3IEJpZ051bWJlcigxKSxcblxuXG4gICAgICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqIEVESVRBQkxFIERFRkFVTFRTICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cblxuICAgICAgICAgICAgLypcbiAgICAgICAgICAgICAqIFRoZSBkZWZhdWx0IHZhbHVlcyBiZWxvdyBtdXN0IGJlIGludGVnZXJzIHdpdGhpbiB0aGUgaW5jbHVzaXZlIHJhbmdlcyBzdGF0ZWQuXG4gICAgICAgICAgICAgKiBUaGUgdmFsdWVzIGNhbiBhbHNvIGJlIGNoYW5nZWQgYXQgcnVuLXRpbWUgdXNpbmcgQmlnTnVtYmVyLmNvbmZpZy5cbiAgICAgICAgICAgICAqL1xuXG4gICAgICAgICAgICAvLyBUaGUgbWF4aW11bSBudW1iZXIgb2YgZGVjaW1hbCBwbGFjZXMgZm9yIG9wZXJhdGlvbnMgaW52b2x2aW5nIGRpdmlzaW9uLlxuICAgICAgICAgICAgREVDSU1BTF9QTEFDRVMgPSAyMCwgICAgICAgICAgICAgICAgICAgICAvLyAwIHRvIE1BWFxuXG4gICAgICAgICAgICAvKlxuICAgICAgICAgICAgICogVGhlIHJvdW5kaW5nIG1vZGUgdXNlZCB3aGVuIHJvdW5kaW5nIHRvIHRoZSBhYm92ZSBkZWNpbWFsIHBsYWNlcywgYW5kIHdoZW4gdXNpbmdcbiAgICAgICAgICAgICAqIHRvRXhwb25lbnRpYWwsIHRvRml4ZWQsIHRvRm9ybWF0IGFuZCB0b1ByZWNpc2lvbiwgYW5kIHJvdW5kIChkZWZhdWx0IHZhbHVlKS5cbiAgICAgICAgICAgICAqIFVQICAgICAgICAgMCBBd2F5IGZyb20gemVyby5cbiAgICAgICAgICAgICAqIERPV04gICAgICAgMSBUb3dhcmRzIHplcm8uXG4gICAgICAgICAgICAgKiBDRUlMICAgICAgIDIgVG93YXJkcyArSW5maW5pdHkuXG4gICAgICAgICAgICAgKiBGTE9PUiAgICAgIDMgVG93YXJkcyAtSW5maW5pdHkuXG4gICAgICAgICAgICAgKiBIQUxGX1VQICAgIDQgVG93YXJkcyBuZWFyZXN0IG5laWdoYm91ci4gSWYgZXF1aWRpc3RhbnQsIHVwLlxuICAgICAgICAgICAgICogSEFMRl9ET1dOICA1IFRvd2FyZHMgbmVhcmVzdCBuZWlnaGJvdXIuIElmIGVxdWlkaXN0YW50LCBkb3duLlxuICAgICAgICAgICAgICogSEFMRl9FVkVOICA2IFRvd2FyZHMgbmVhcmVzdCBuZWlnaGJvdXIuIElmIGVxdWlkaXN0YW50LCB0b3dhcmRzIGV2ZW4gbmVpZ2hib3VyLlxuICAgICAgICAgICAgICogSEFMRl9DRUlMICA3IFRvd2FyZHMgbmVhcmVzdCBuZWlnaGJvdXIuIElmIGVxdWlkaXN0YW50LCB0b3dhcmRzICtJbmZpbml0eS5cbiAgICAgICAgICAgICAqIEhBTEZfRkxPT1IgOCBUb3dhcmRzIG5lYXJlc3QgbmVpZ2hib3VyLiBJZiBlcXVpZGlzdGFudCwgdG93YXJkcyAtSW5maW5pdHkuXG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIFJPVU5ESU5HX01PREUgPSA0LCAgICAgICAgICAgICAgICAgICAgICAgLy8gMCB0byA4XG5cbiAgICAgICAgICAgIC8vIEVYUE9ORU5USUFMX0FUIDogW1RPX0VYUF9ORUcgLCBUT19FWFBfUE9TXVxuXG4gICAgICAgICAgICAvLyBUaGUgZXhwb25lbnQgdmFsdWUgYXQgYW5kIGJlbmVhdGggd2hpY2ggdG9TdHJpbmcgcmV0dXJucyBleHBvbmVudGlhbCBub3RhdGlvbi5cbiAgICAgICAgICAgIC8vIE51bWJlciB0eXBlOiAtN1xuICAgICAgICAgICAgVE9fRVhQX05FRyA9IC03LCAgICAgICAgICAgICAgICAgICAgICAgICAvLyAwIHRvIC1NQVhcblxuICAgICAgICAgICAgLy8gVGhlIGV4cG9uZW50IHZhbHVlIGF0IGFuZCBhYm92ZSB3aGljaCB0b1N0cmluZyByZXR1cm5zIGV4cG9uZW50aWFsIG5vdGF0aW9uLlxuICAgICAgICAgICAgLy8gTnVtYmVyIHR5cGU6IDIxXG4gICAgICAgICAgICBUT19FWFBfUE9TID0gMjEsICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDAgdG8gTUFYXG5cbiAgICAgICAgICAgIC8vIFJBTkdFIDogW01JTl9FWFAsIE1BWF9FWFBdXG5cbiAgICAgICAgICAgIC8vIFRoZSBtaW5pbXVtIGV4cG9uZW50IHZhbHVlLCBiZW5lYXRoIHdoaWNoIHVuZGVyZmxvdyB0byB6ZXJvIG9jY3Vycy5cbiAgICAgICAgICAgIC8vIE51bWJlciB0eXBlOiAtMzI0ICAoNWUtMzI0KVxuICAgICAgICAgICAgTUlOX0VYUCA9IC0xZTcsICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAtMSB0byAtTUFYXG5cbiAgICAgICAgICAgIC8vIFRoZSBtYXhpbXVtIGV4cG9uZW50IHZhbHVlLCBhYm92ZSB3aGljaCBvdmVyZmxvdyB0byBJbmZpbml0eSBvY2N1cnMuXG4gICAgICAgICAgICAvLyBOdW1iZXIgdHlwZTogIDMwOCAgKDEuNzk3NjkzMTM0ODYyMzE1N2UrMzA4KVxuICAgICAgICAgICAgLy8gRm9yIE1BWF9FWFAgPiAxZTcsIGUuZy4gbmV3IEJpZ051bWJlcignMWUxMDAwMDAwMDAnKS5wbHVzKDEpIG1heSBiZSBzbG93LlxuICAgICAgICAgICAgTUFYX0VYUCA9IDFlNywgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAxIHRvIE1BWFxuXG4gICAgICAgICAgICAvLyBXaGV0aGVyIEJpZ051bWJlciBFcnJvcnMgYXJlIGV2ZXIgdGhyb3duLlxuICAgICAgICAgICAgRVJST1JTID0gdHJ1ZSwgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0cnVlIG9yIGZhbHNlXG5cbiAgICAgICAgICAgIC8vIENoYW5nZSB0byBpbnRWYWxpZGF0b3JOb0Vycm9ycyBpZiBFUlJPUlMgaXMgZmFsc2UuXG4gICAgICAgICAgICBpc1ZhbGlkSW50ID0gaW50VmFsaWRhdG9yV2l0aEVycm9ycywgICAgIC8vIGludFZhbGlkYXRvcldpdGhFcnJvcnMvaW50VmFsaWRhdG9yTm9FcnJvcnNcblxuICAgICAgICAgICAgLy8gV2hldGhlciB0byB1c2UgY3J5cHRvZ3JhcGhpY2FsbHktc2VjdXJlIHJhbmRvbSBudW1iZXIgZ2VuZXJhdGlvbiwgaWYgYXZhaWxhYmxlLlxuICAgICAgICAgICAgQ1JZUFRPID0gZmFsc2UsICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB0cnVlIG9yIGZhbHNlXG5cbiAgICAgICAgICAgIC8qXG4gICAgICAgICAgICAgKiBUaGUgbW9kdWxvIG1vZGUgdXNlZCB3aGVuIGNhbGN1bGF0aW5nIHRoZSBtb2R1bHVzOiBhIG1vZCBuLlxuICAgICAgICAgICAgICogVGhlIHF1b3RpZW50IChxID0gYSAvIG4pIGlzIGNhbGN1bGF0ZWQgYWNjb3JkaW5nIHRvIHRoZSBjb3JyZXNwb25kaW5nIHJvdW5kaW5nIG1vZGUuXG4gICAgICAgICAgICAgKiBUaGUgcmVtYWluZGVyIChyKSBpcyBjYWxjdWxhdGVkIGFzOiByID0gYSAtIG4gKiBxLlxuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIFVQICAgICAgICAwIFRoZSByZW1haW5kZXIgaXMgcG9zaXRpdmUgaWYgdGhlIGRpdmlkZW5kIGlzIG5lZ2F0aXZlLCBlbHNlIGlzIG5lZ2F0aXZlLlxuICAgICAgICAgICAgICogRE9XTiAgICAgIDEgVGhlIHJlbWFpbmRlciBoYXMgdGhlIHNhbWUgc2lnbiBhcyB0aGUgZGl2aWRlbmQuXG4gICAgICAgICAgICAgKiAgICAgICAgICAgICBUaGlzIG1vZHVsbyBtb2RlIGlzIGNvbW1vbmx5IGtub3duIGFzICd0cnVuY2F0ZWQgZGl2aXNpb24nIGFuZCBpc1xuICAgICAgICAgICAgICogICAgICAgICAgICAgZXF1aXZhbGVudCB0byAoYSAlIG4pIGluIEphdmFTY3JpcHQuXG4gICAgICAgICAgICAgKiBGTE9PUiAgICAgMyBUaGUgcmVtYWluZGVyIGhhcyB0aGUgc2FtZSBzaWduIGFzIHRoZSBkaXZpc29yIChQeXRob24gJSkuXG4gICAgICAgICAgICAgKiBIQUxGX0VWRU4gNiBUaGlzIG1vZHVsbyBtb2RlIGltcGxlbWVudHMgdGhlIElFRUUgNzU0IHJlbWFpbmRlciBmdW5jdGlvbi5cbiAgICAgICAgICAgICAqIEVVQ0xJRCAgICA5IEV1Y2xpZGlhbiBkaXZpc2lvbi4gcSA9IHNpZ24obikgKiBmbG9vcihhIC8gYWJzKG4pKS5cbiAgICAgICAgICAgICAqICAgICAgICAgICAgIFRoZSByZW1haW5kZXIgaXMgYWx3YXlzIHBvc2l0aXZlLlxuICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAqIFRoZSB0cnVuY2F0ZWQgZGl2aXNpb24sIGZsb29yZWQgZGl2aXNpb24sIEV1Y2xpZGlhbiBkaXZpc2lvbiBhbmQgSUVFRSA3NTQgcmVtYWluZGVyXG4gICAgICAgICAgICAgKiBtb2RlcyBhcmUgY29tbW9ubHkgdXNlZCBmb3IgdGhlIG1vZHVsdXMgb3BlcmF0aW9uLlxuICAgICAgICAgICAgICogQWx0aG91Z2ggdGhlIG90aGVyIHJvdW5kaW5nIG1vZGVzIGNhbiBhbHNvIGJlIHVzZWQsIHRoZXkgbWF5IG5vdCBnaXZlIHVzZWZ1bCByZXN1bHRzLlxuICAgICAgICAgICAgICovXG4gICAgICAgICAgICBNT0RVTE9fTU9ERSA9IDEsICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDAgdG8gOVxuXG4gICAgICAgICAgICAvLyBUaGUgbWF4aW11bSBudW1iZXIgb2Ygc2lnbmlmaWNhbnQgZGlnaXRzIG9mIHRoZSByZXN1bHQgb2YgdGhlIHRvUG93ZXIgb3BlcmF0aW9uLlxuICAgICAgICAgICAgLy8gSWYgUE9XX1BSRUNJU0lPTiBpcyAwLCB0aGVyZSB3aWxsIGJlIHVubGltaXRlZCBzaWduaWZpY2FudCBkaWdpdHMuXG4gICAgICAgICAgICBQT1dfUFJFQ0lTSU9OID0gMTAwLCAgICAgICAgICAgICAgICAgICAgIC8vIDAgdG8gTUFYXG5cbiAgICAgICAgICAgIC8vIFRoZSBmb3JtYXQgc3BlY2lmaWNhdGlvbiB1c2VkIGJ5IHRoZSBCaWdOdW1iZXIucHJvdG90eXBlLnRvRm9ybWF0IG1ldGhvZC5cbiAgICAgICAgICAgIEZPUk1BVCA9IHtcbiAgICAgICAgICAgICAgICBkZWNpbWFsU2VwYXJhdG9yOiAnLicsXG4gICAgICAgICAgICAgICAgZ3JvdXBTZXBhcmF0b3I6ICcsJyxcbiAgICAgICAgICAgICAgICBncm91cFNpemU6IDMsXG4gICAgICAgICAgICAgICAgc2Vjb25kYXJ5R3JvdXBTaXplOiAwLFxuICAgICAgICAgICAgICAgIGZyYWN0aW9uR3JvdXBTZXBhcmF0b3I6ICdcXHhBMCcsICAgICAgLy8gbm9uLWJyZWFraW5nIHNwYWNlXG4gICAgICAgICAgICAgICAgZnJhY3Rpb25Hcm91cFNpemU6IDBcbiAgICAgICAgICAgIH07XG5cblxuICAgICAgICAvKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG5cbiAgICAgICAgLy8gQ09OU1RSVUNUT1JcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFRoZSBCaWdOdW1iZXIgY29uc3RydWN0b3IgYW5kIGV4cG9ydGVkIGZ1bmN0aW9uLlxuICAgICAgICAgKiBDcmVhdGUgYW5kIHJldHVybiBhIG5ldyBpbnN0YW5jZSBvZiBhIEJpZ051bWJlciBvYmplY3QuXG4gICAgICAgICAqXG4gICAgICAgICAqIG4ge251bWJlcnxzdHJpbmd8QmlnTnVtYmVyfSBBIG51bWVyaWMgdmFsdWUuXG4gICAgICAgICAqIFtiXSB7bnVtYmVyfSBUaGUgYmFzZSBvZiBuLiBJbnRlZ2VyLCAyIHRvIDY0IGluY2x1c2l2ZS5cbiAgICAgICAgICovXG4gICAgICAgIGZ1bmN0aW9uIEJpZ051bWJlciggbiwgYiApIHtcbiAgICAgICAgICAgIHZhciBjLCBlLCBpLCBudW0sIGxlbiwgc3RyLFxuICAgICAgICAgICAgICAgIHggPSB0aGlzO1xuXG4gICAgICAgICAgICAvLyBFbmFibGUgY29uc3RydWN0b3IgdXNhZ2Ugd2l0aG91dCBuZXcuXG4gICAgICAgICAgICBpZiAoICEoIHggaW5zdGFuY2VvZiBCaWdOdW1iZXIgKSApIHtcblxuICAgICAgICAgICAgICAgIC8vICdCaWdOdW1iZXIoKSBjb25zdHJ1Y3RvciBjYWxsIHdpdGhvdXQgbmV3OiB7bn0nXG4gICAgICAgICAgICAgICAgaWYgKEVSUk9SUykgcmFpc2UoIDI2LCAnY29uc3RydWN0b3IgY2FsbCB3aXRob3V0IG5ldycsIG4gKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IEJpZ051bWJlciggbiwgYiApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyAnbmV3IEJpZ051bWJlcigpIGJhc2Ugbm90IGFuIGludGVnZXI6IHtifSdcbiAgICAgICAgICAgIC8vICduZXcgQmlnTnVtYmVyKCkgYmFzZSBvdXQgb2YgcmFuZ2U6IHtifSdcbiAgICAgICAgICAgIGlmICggYiA9PSBudWxsIHx8ICFpc1ZhbGlkSW50KCBiLCAyLCA2NCwgaWQsICdiYXNlJyApICkge1xuXG4gICAgICAgICAgICAgICAgLy8gRHVwbGljYXRlLlxuICAgICAgICAgICAgICAgIGlmICggbiBpbnN0YW5jZW9mIEJpZ051bWJlciApIHtcbiAgICAgICAgICAgICAgICAgICAgeC5zID0gbi5zO1xuICAgICAgICAgICAgICAgICAgICB4LmUgPSBuLmU7XG4gICAgICAgICAgICAgICAgICAgIHguYyA9ICggbiA9IG4uYyApID8gbi5zbGljZSgpIDogbjtcbiAgICAgICAgICAgICAgICAgICAgaWQgPSAwO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKCAoIG51bSA9IHR5cGVvZiBuID09ICdudW1iZXInICkgJiYgbiAqIDAgPT0gMCApIHtcbiAgICAgICAgICAgICAgICAgICAgeC5zID0gMSAvIG4gPCAwID8gKCBuID0gLW4sIC0xICkgOiAxO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEZhc3QgcGF0aCBmb3IgaW50ZWdlcnMuXG4gICAgICAgICAgICAgICAgICAgIGlmICggbiA9PT0gfn5uICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICggZSA9IDAsIGkgPSBuOyBpID49IDEwOyBpIC89IDEwLCBlKysgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHguZSA9IGU7XG4gICAgICAgICAgICAgICAgICAgICAgICB4LmMgPSBbbl07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBzdHIgPSBuICsgJyc7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCAhaXNOdW1lcmljLnRlc3QoIHN0ciA9IG4gKyAnJyApICkgcmV0dXJuIHBhcnNlTnVtZXJpYyggeCwgc3RyLCBudW0gKTtcbiAgICAgICAgICAgICAgICAgICAgeC5zID0gc3RyLmNoYXJDb2RlQXQoMCkgPT09IDQ1ID8gKCBzdHIgPSBzdHIuc2xpY2UoMSksIC0xICkgOiAxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYiA9IGIgfCAwO1xuICAgICAgICAgICAgICAgIHN0ciA9IG4gKyAnJztcblxuICAgICAgICAgICAgICAgIC8vIEVuc3VyZSByZXR1cm4gdmFsdWUgaXMgcm91bmRlZCB0byBERUNJTUFMX1BMQUNFUyBhcyB3aXRoIG90aGVyIGJhc2VzLlxuICAgICAgICAgICAgICAgIC8vIEFsbG93IGV4cG9uZW50aWFsIG5vdGF0aW9uIHRvIGJlIHVzZWQgd2l0aCBiYXNlIDEwIGFyZ3VtZW50LlxuICAgICAgICAgICAgICAgIGlmICggYiA9PSAxMCApIHtcbiAgICAgICAgICAgICAgICAgICAgeCA9IG5ldyBCaWdOdW1iZXIoIG4gaW5zdGFuY2VvZiBCaWdOdW1iZXIgPyBuIDogc3RyICk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiByb3VuZCggeCwgREVDSU1BTF9QTEFDRVMgKyB4LmUgKyAxLCBST1VORElOR19NT0RFICk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQXZvaWQgcG90ZW50aWFsIGludGVycHJldGF0aW9uIG9mIEluZmluaXR5IGFuZCBOYU4gYXMgYmFzZSA0NCsgdmFsdWVzLlxuICAgICAgICAgICAgICAgIC8vIEFueSBudW1iZXIgaW4gZXhwb25lbnRpYWwgZm9ybSB3aWxsIGZhaWwgZHVlIHRvIHRoZSBbRWVdWystXS5cbiAgICAgICAgICAgICAgICBpZiAoICggbnVtID0gdHlwZW9mIG4gPT0gJ251bWJlcicgKSAmJiBuICogMCAhPSAwIHx8XG4gICAgICAgICAgICAgICAgICAhKCBuZXcgUmVnRXhwKCAnXi0/JyArICggYyA9ICdbJyArIEFMUEhBQkVULnNsaWNlKCAwLCBiICkgKyAnXSsnICkgK1xuICAgICAgICAgICAgICAgICAgICAnKD86XFxcXC4nICsgYyArICcpPyQnLGIgPCAzNyA/ICdpJyA6ICcnICkgKS50ZXN0KHN0cikgKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBwYXJzZU51bWVyaWMoIHgsIHN0ciwgbnVtLCBiICk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKG51bSkge1xuICAgICAgICAgICAgICAgICAgICB4LnMgPSAxIC8gbiA8IDAgPyAoIHN0ciA9IHN0ci5zbGljZSgxKSwgLTEgKSA6IDE7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCBFUlJPUlMgJiYgc3RyLnJlcGxhY2UoIC9eMFxcLjAqfFxcLi8sICcnICkubGVuZ3RoID4gMTUgKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICduZXcgQmlnTnVtYmVyKCkgbnVtYmVyIHR5cGUgaGFzIG1vcmUgdGhhbiAxNSBzaWduaWZpY2FudCBkaWdpdHM6IHtufSdcbiAgICAgICAgICAgICAgICAgICAgICAgIHJhaXNlKCBpZCwgdG9vTWFueURpZ2l0cywgbiApO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gUHJldmVudCBsYXRlciBjaGVjayBmb3IgbGVuZ3RoIG9uIGNvbnZlcnRlZCBudW1iZXIuXG4gICAgICAgICAgICAgICAgICAgIG51bSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHgucyA9IHN0ci5jaGFyQ29kZUF0KDApID09PSA0NSA/ICggc3RyID0gc3RyLnNsaWNlKDEpLCAtMSApIDogMTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzdHIgPSBjb252ZXJ0QmFzZSggc3RyLCAxMCwgYiwgeC5zICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIERlY2ltYWwgcG9pbnQ/XG4gICAgICAgICAgICBpZiAoICggZSA9IHN0ci5pbmRleE9mKCcuJykgKSA+IC0xICkgc3RyID0gc3RyLnJlcGxhY2UoICcuJywgJycgKTtcblxuICAgICAgICAgICAgLy8gRXhwb25lbnRpYWwgZm9ybT9cbiAgICAgICAgICAgIGlmICggKCBpID0gc3RyLnNlYXJjaCggL2UvaSApICkgPiAwICkge1xuXG4gICAgICAgICAgICAgICAgLy8gRGV0ZXJtaW5lIGV4cG9uZW50LlxuICAgICAgICAgICAgICAgIGlmICggZSA8IDAgKSBlID0gaTtcbiAgICAgICAgICAgICAgICBlICs9ICtzdHIuc2xpY2UoIGkgKyAxICk7XG4gICAgICAgICAgICAgICAgc3RyID0gc3RyLnN1YnN0cmluZyggMCwgaSApO1xuICAgICAgICAgICAgfSBlbHNlIGlmICggZSA8IDAgKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBJbnRlZ2VyLlxuICAgICAgICAgICAgICAgIGUgPSBzdHIubGVuZ3RoO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgbGVhZGluZyB6ZXJvcy5cbiAgICAgICAgICAgIGZvciAoIGkgPSAwOyBzdHIuY2hhckNvZGVBdChpKSA9PT0gNDg7IGkrKyApO1xuXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgdHJhaWxpbmcgemVyb3MuXG4gICAgICAgICAgICBmb3IgKCBsZW4gPSBzdHIubGVuZ3RoOyBzdHIuY2hhckNvZGVBdCgtLWxlbikgPT09IDQ4OyApO1xuICAgICAgICAgICAgc3RyID0gc3RyLnNsaWNlKCBpLCBsZW4gKyAxICk7XG5cbiAgICAgICAgICAgIGlmIChzdHIpIHtcbiAgICAgICAgICAgICAgICBsZW4gPSBzdHIubGVuZ3RoO1xuXG4gICAgICAgICAgICAgICAgLy8gRGlzYWxsb3cgbnVtYmVycyB3aXRoIG92ZXIgMTUgc2lnbmlmaWNhbnQgZGlnaXRzIGlmIG51bWJlciB0eXBlLlxuICAgICAgICAgICAgICAgIC8vICduZXcgQmlnTnVtYmVyKCkgbnVtYmVyIHR5cGUgaGFzIG1vcmUgdGhhbiAxNSBzaWduaWZpY2FudCBkaWdpdHM6IHtufSdcbiAgICAgICAgICAgICAgICBpZiAoIG51bSAmJiBFUlJPUlMgJiYgbGVuID4gMTUgKSByYWlzZSggaWQsIHRvb01hbnlEaWdpdHMsIHgucyAqIG4gKTtcblxuICAgICAgICAgICAgICAgIGUgPSBlIC0gaSAtIDE7XG5cbiAgICAgICAgICAgICAgICAgLy8gT3ZlcmZsb3c/XG4gICAgICAgICAgICAgICAgaWYgKCBlID4gTUFYX0VYUCApIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBJbmZpbml0eS5cbiAgICAgICAgICAgICAgICAgICAgeC5jID0geC5lID0gbnVsbDtcblxuICAgICAgICAgICAgICAgIC8vIFVuZGVyZmxvdz9cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCBlIDwgTUlOX0VYUCApIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBaZXJvLlxuICAgICAgICAgICAgICAgICAgICB4LmMgPSBbIHguZSA9IDAgXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB4LmUgPSBlO1xuICAgICAgICAgICAgICAgICAgICB4LmMgPSBbXTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBUcmFuc2Zvcm0gYmFzZVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIGUgaXMgdGhlIGJhc2UgMTAgZXhwb25lbnQuXG4gICAgICAgICAgICAgICAgICAgIC8vIGkgaXMgd2hlcmUgdG8gc2xpY2Ugc3RyIHRvIGdldCB0aGUgZmlyc3QgZWxlbWVudCBvZiB0aGUgY29lZmZpY2llbnQgYXJyYXkuXG4gICAgICAgICAgICAgICAgICAgIGkgPSAoIGUgKyAxICkgJSBMT0dfQkFTRTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCBlIDwgMCApIGkgKz0gTE9HX0JBU0U7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCBpIDwgbGVuICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGkpIHguYy5wdXNoKCArc3RyLnNsaWNlKCAwLCBpICkgKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICggbGVuIC09IExPR19CQVNFOyBpIDwgbGVuOyApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4LmMucHVzaCggK3N0ci5zbGljZSggaSwgaSArPSBMT0dfQkFTRSApICk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHN0ciA9IHN0ci5zbGljZShpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGkgPSBMT0dfQkFTRSAtIHN0ci5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpIC09IGxlbjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoIDsgaS0tOyBzdHIgKz0gJzAnICk7XG4gICAgICAgICAgICAgICAgICAgIHguYy5wdXNoKCArc3RyICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgIC8vIFplcm8uXG4gICAgICAgICAgICAgICAgeC5jID0gWyB4LmUgPSAwIF07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlkID0gMDtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gQ09OU1RSVUNUT1IgUFJPUEVSVElFU1xuXG5cbiAgICAgICAgQmlnTnVtYmVyLmFub3RoZXIgPSBhbm90aGVyO1xuXG4gICAgICAgIEJpZ051bWJlci5ST1VORF9VUCA9IDA7XG4gICAgICAgIEJpZ051bWJlci5ST1VORF9ET1dOID0gMTtcbiAgICAgICAgQmlnTnVtYmVyLlJPVU5EX0NFSUwgPSAyO1xuICAgICAgICBCaWdOdW1iZXIuUk9VTkRfRkxPT1IgPSAzO1xuICAgICAgICBCaWdOdW1iZXIuUk9VTkRfSEFMRl9VUCA9IDQ7XG4gICAgICAgIEJpZ051bWJlci5ST1VORF9IQUxGX0RPV04gPSA1O1xuICAgICAgICBCaWdOdW1iZXIuUk9VTkRfSEFMRl9FVkVOID0gNjtcbiAgICAgICAgQmlnTnVtYmVyLlJPVU5EX0hBTEZfQ0VJTCA9IDc7XG4gICAgICAgIEJpZ051bWJlci5ST1VORF9IQUxGX0ZMT09SID0gODtcbiAgICAgICAgQmlnTnVtYmVyLkVVQ0xJRCA9IDk7XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBDb25maWd1cmUgaW5mcmVxdWVudGx5LWNoYW5naW5nIGxpYnJhcnktd2lkZSBzZXR0aW5ncy5cbiAgICAgICAgICpcbiAgICAgICAgICogQWNjZXB0IGFuIG9iamVjdCBvciBhbiBhcmd1bWVudCBsaXN0LCB3aXRoIG9uZSBvciBtYW55IG9mIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllcyBvclxuICAgICAgICAgKiBwYXJhbWV0ZXJzIHJlc3BlY3RpdmVseTpcbiAgICAgICAgICpcbiAgICAgICAgICogICBERUNJTUFMX1BMQUNFUyAge251bWJlcn0gIEludGVnZXIsIDAgdG8gTUFYIGluY2x1c2l2ZVxuICAgICAgICAgKiAgIFJPVU5ESU5HX01PREUgICB7bnVtYmVyfSAgSW50ZWdlciwgMCB0byA4IGluY2x1c2l2ZVxuICAgICAgICAgKiAgIEVYUE9ORU5USUFMX0FUICB7bnVtYmVyfG51bWJlcltdfSAgSW50ZWdlciwgLU1BWCB0byBNQVggaW5jbHVzaXZlIG9yXG4gICAgICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbaW50ZWdlciAtTUFYIHRvIDAgaW5jbC4sIDAgdG8gTUFYIGluY2wuXVxuICAgICAgICAgKiAgIFJBTkdFICAgICAgICAgICB7bnVtYmVyfG51bWJlcltdfSAgTm9uLXplcm8gaW50ZWdlciwgLU1BWCB0byBNQVggaW5jbHVzaXZlIG9yXG4gICAgICAgICAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbaW50ZWdlciAtTUFYIHRvIC0xIGluY2wuLCBpbnRlZ2VyIDEgdG8gTUFYIGluY2wuXVxuICAgICAgICAgKiAgIEVSUk9SUyAgICAgICAgICB7Ym9vbGVhbnxudW1iZXJ9ICAgdHJ1ZSwgZmFsc2UsIDEgb3IgMFxuICAgICAgICAgKiAgIENSWVBUTyAgICAgICAgICB7Ym9vbGVhbnxudW1iZXJ9ICAgdHJ1ZSwgZmFsc2UsIDEgb3IgMFxuICAgICAgICAgKiAgIE1PRFVMT19NT0RFICAgICB7bnVtYmVyfSAgICAgICAgICAgMCB0byA5IGluY2x1c2l2ZVxuICAgICAgICAgKiAgIFBPV19QUkVDSVNJT04gICB7bnVtYmVyfSAgICAgICAgICAgMCB0byBNQVggaW5jbHVzaXZlXG4gICAgICAgICAqICAgRk9STUFUICAgICAgICAgIHtvYmplY3R9ICAgICAgICAgICBTZWUgQmlnTnVtYmVyLnByb3RvdHlwZS50b0Zvcm1hdFxuICAgICAgICAgKiAgICAgIGRlY2ltYWxTZXBhcmF0b3IgICAgICAge3N0cmluZ31cbiAgICAgICAgICogICAgICBncm91cFNlcGFyYXRvciAgICAgICAgIHtzdHJpbmd9XG4gICAgICAgICAqICAgICAgZ3JvdXBTaXplICAgICAgICAgICAgICB7bnVtYmVyfVxuICAgICAgICAgKiAgICAgIHNlY29uZGFyeUdyb3VwU2l6ZSAgICAge251bWJlcn1cbiAgICAgICAgICogICAgICBmcmFjdGlvbkdyb3VwU2VwYXJhdG9yIHtzdHJpbmd9XG4gICAgICAgICAqICAgICAgZnJhY3Rpb25Hcm91cFNpemUgICAgICB7bnVtYmVyfVxuICAgICAgICAgKlxuICAgICAgICAgKiAoVGhlIHZhbHVlcyBhc3NpZ25lZCB0byB0aGUgYWJvdmUgRk9STUFUIG9iamVjdCBwcm9wZXJ0aWVzIGFyZSBub3QgY2hlY2tlZCBmb3IgdmFsaWRpdHkuKVxuICAgICAgICAgKlxuICAgICAgICAgKiBFLmcuXG4gICAgICAgICAqIEJpZ051bWJlci5jb25maWcoMjAsIDQpIGlzIGVxdWl2YWxlbnQgdG9cbiAgICAgICAgICogQmlnTnVtYmVyLmNvbmZpZyh7IERFQ0lNQUxfUExBQ0VTIDogMjAsIFJPVU5ESU5HX01PREUgOiA0IH0pXG4gICAgICAgICAqXG4gICAgICAgICAqIElnbm9yZSBwcm9wZXJ0aWVzL3BhcmFtZXRlcnMgc2V0IHRvIG51bGwgb3IgdW5kZWZpbmVkLlxuICAgICAgICAgKiBSZXR1cm4gYW4gb2JqZWN0IHdpdGggdGhlIHByb3BlcnRpZXMgY3VycmVudCB2YWx1ZXMuXG4gICAgICAgICAqL1xuICAgICAgICBCaWdOdW1iZXIuY29uZmlnID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHYsIHAsXG4gICAgICAgICAgICAgICAgaSA9IDAsXG4gICAgICAgICAgICAgICAgciA9IHt9LFxuICAgICAgICAgICAgICAgIGEgPSBhcmd1bWVudHMsXG4gICAgICAgICAgICAgICAgbyA9IGFbMF0sXG4gICAgICAgICAgICAgICAgaGFzID0gbyAmJiB0eXBlb2YgbyA9PSAnb2JqZWN0J1xuICAgICAgICAgICAgICAgICAgPyBmdW5jdGlvbiAoKSB7IGlmICggby5oYXNPd25Qcm9wZXJ0eShwKSApIHJldHVybiAoIHYgPSBvW3BdICkgIT0gbnVsbDsgfVxuICAgICAgICAgICAgICAgICAgOiBmdW5jdGlvbiAoKSB7IGlmICggYS5sZW5ndGggPiBpICkgcmV0dXJuICggdiA9IGFbaSsrXSApICE9IG51bGw7IH07XG5cbiAgICAgICAgICAgIC8vIERFQ0lNQUxfUExBQ0VTIHtudW1iZXJ9IEludGVnZXIsIDAgdG8gTUFYIGluY2x1c2l2ZS5cbiAgICAgICAgICAgIC8vICdjb25maWcoKSBERUNJTUFMX1BMQUNFUyBub3QgYW4gaW50ZWdlcjoge3Z9J1xuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIERFQ0lNQUxfUExBQ0VTIG91dCBvZiByYW5nZToge3Z9J1xuICAgICAgICAgICAgaWYgKCBoYXMoIHAgPSAnREVDSU1BTF9QTEFDRVMnICkgJiYgaXNWYWxpZEludCggdiwgMCwgTUFYLCAyLCBwICkgKSB7XG4gICAgICAgICAgICAgICAgREVDSU1BTF9QTEFDRVMgPSB2IHwgMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJbcF0gPSBERUNJTUFMX1BMQUNFUztcblxuICAgICAgICAgICAgLy8gUk9VTkRJTkdfTU9ERSB7bnVtYmVyfSBJbnRlZ2VyLCAwIHRvIDggaW5jbHVzaXZlLlxuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIFJPVU5ESU5HX01PREUgbm90IGFuIGludGVnZXI6IHt2fSdcbiAgICAgICAgICAgIC8vICdjb25maWcoKSBST1VORElOR19NT0RFIG91dCBvZiByYW5nZToge3Z9J1xuICAgICAgICAgICAgaWYgKCBoYXMoIHAgPSAnUk9VTkRJTkdfTU9ERScgKSAmJiBpc1ZhbGlkSW50KCB2LCAwLCA4LCAyLCBwICkgKSB7XG4gICAgICAgICAgICAgICAgUk9VTkRJTkdfTU9ERSA9IHYgfCAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcltwXSA9IFJPVU5ESU5HX01PREU7XG5cbiAgICAgICAgICAgIC8vIEVYUE9ORU5USUFMX0FUIHtudW1iZXJ8bnVtYmVyW119XG4gICAgICAgICAgICAvLyBJbnRlZ2VyLCAtTUFYIHRvIE1BWCBpbmNsdXNpdmUgb3IgW2ludGVnZXIgLU1BWCB0byAwIGluY2x1c2l2ZSwgMCB0byBNQVggaW5jbHVzaXZlXS5cbiAgICAgICAgICAgIC8vICdjb25maWcoKSBFWFBPTkVOVElBTF9BVCBub3QgYW4gaW50ZWdlcjoge3Z9J1xuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIEVYUE9ORU5USUFMX0FUIG91dCBvZiByYW5nZToge3Z9J1xuICAgICAgICAgICAgaWYgKCBoYXMoIHAgPSAnRVhQT05FTlRJQUxfQVQnICkgKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoIGlzQXJyYXkodikgKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICggaXNWYWxpZEludCggdlswXSwgLU1BWCwgMCwgMiwgcCApICYmIGlzVmFsaWRJbnQoIHZbMV0sIDAsIE1BWCwgMiwgcCApICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgVE9fRVhQX05FRyA9IHZbMF0gfCAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgVE9fRVhQX1BPUyA9IHZbMV0gfCAwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICggaXNWYWxpZEludCggdiwgLU1BWCwgTUFYLCAyLCBwICkgKSB7XG4gICAgICAgICAgICAgICAgICAgIFRPX0VYUF9ORUcgPSAtKCBUT19FWFBfUE9TID0gKCB2IDwgMCA/IC12IDogdiApIHwgMCApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJbcF0gPSBbIFRPX0VYUF9ORUcsIFRPX0VYUF9QT1MgXTtcblxuICAgICAgICAgICAgLy8gUkFOR0Uge251bWJlcnxudW1iZXJbXX0gTm9uLXplcm8gaW50ZWdlciwgLU1BWCB0byBNQVggaW5jbHVzaXZlIG9yXG4gICAgICAgICAgICAvLyBbaW50ZWdlciAtTUFYIHRvIC0xIGluY2x1c2l2ZSwgaW50ZWdlciAxIHRvIE1BWCBpbmNsdXNpdmVdLlxuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIFJBTkdFIG5vdCBhbiBpbnRlZ2VyOiB7dn0nXG4gICAgICAgICAgICAvLyAnY29uZmlnKCkgUkFOR0UgY2Fubm90IGJlIHplcm86IHt2fSdcbiAgICAgICAgICAgIC8vICdjb25maWcoKSBSQU5HRSBvdXQgb2YgcmFuZ2U6IHt2fSdcbiAgICAgICAgICAgIGlmICggaGFzKCBwID0gJ1JBTkdFJyApICkge1xuXG4gICAgICAgICAgICAgICAgaWYgKCBpc0FycmF5KHYpICkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIGlzVmFsaWRJbnQoIHZbMF0sIC1NQVgsIC0xLCAyLCBwICkgJiYgaXNWYWxpZEludCggdlsxXSwgMSwgTUFYLCAyLCBwICkgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBNSU5fRVhQID0gdlswXSB8IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICBNQVhfRVhQID0gdlsxXSB8IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCBpc1ZhbGlkSW50KCB2LCAtTUFYLCBNQVgsIDIsIHAgKSApIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCB2IHwgMCApIE1JTl9FWFAgPSAtKCBNQVhfRVhQID0gKCB2IDwgMCA/IC12IDogdiApIHwgMCApO1xuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChFUlJPUlMpIHJhaXNlKCAyLCBwICsgJyBjYW5ub3QgYmUgemVybycsIHYgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByW3BdID0gWyBNSU5fRVhQLCBNQVhfRVhQIF07XG5cbiAgICAgICAgICAgIC8vIEVSUk9SUyB7Ym9vbGVhbnxudW1iZXJ9IHRydWUsIGZhbHNlLCAxIG9yIDAuXG4gICAgICAgICAgICAvLyAnY29uZmlnKCkgRVJST1JTIG5vdCBhIGJvb2xlYW4gb3IgYmluYXJ5IGRpZ2l0OiB7dn0nXG4gICAgICAgICAgICBpZiAoIGhhcyggcCA9ICdFUlJPUlMnICkgKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoIHYgPT09ICEhdiB8fCB2ID09PSAxIHx8IHYgPT09IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgIGlkID0gMDtcbiAgICAgICAgICAgICAgICAgICAgaXNWYWxpZEludCA9ICggRVJST1JTID0gISF2ICkgPyBpbnRWYWxpZGF0b3JXaXRoRXJyb3JzIDogaW50VmFsaWRhdG9yTm9FcnJvcnM7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChFUlJPUlMpIHtcbiAgICAgICAgICAgICAgICAgICAgcmFpc2UoIDIsIHAgKyBub3RCb29sLCB2ICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcltwXSA9IEVSUk9SUztcblxuICAgICAgICAgICAgLy8gQ1JZUFRPIHtib29sZWFufG51bWJlcn0gdHJ1ZSwgZmFsc2UsIDEgb3IgMC5cbiAgICAgICAgICAgIC8vICdjb25maWcoKSBDUllQVE8gbm90IGEgYm9vbGVhbiBvciBiaW5hcnkgZGlnaXQ6IHt2fSdcbiAgICAgICAgICAgIC8vICdjb25maWcoKSBjcnlwdG8gdW5hdmFpbGFibGU6IHtjcnlwdG99J1xuICAgICAgICAgICAgaWYgKCBoYXMoIHAgPSAnQ1JZUFRPJyApICkge1xuXG4gICAgICAgICAgICAgICAgaWYgKCB2ID09PSAhIXYgfHwgdiA9PT0gMSB8fCB2ID09PSAwICkge1xuICAgICAgICAgICAgICAgICAgICBDUllQVE8gPSAhISggdiAmJiBjcnlwdG8gJiYgdHlwZW9mIGNyeXB0byA9PSAnb2JqZWN0JyApO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIHYgJiYgIUNSWVBUTyAmJiBFUlJPUlMgKSByYWlzZSggMiwgJ2NyeXB0byB1bmF2YWlsYWJsZScsIGNyeXB0byApO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoRVJST1JTKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhaXNlKCAyLCBwICsgbm90Qm9vbCwgdiApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJbcF0gPSBDUllQVE87XG5cbiAgICAgICAgICAgIC8vIE1PRFVMT19NT0RFIHtudW1iZXJ9IEludGVnZXIsIDAgdG8gOSBpbmNsdXNpdmUuXG4gICAgICAgICAgICAvLyAnY29uZmlnKCkgTU9EVUxPX01PREUgbm90IGFuIGludGVnZXI6IHt2fSdcbiAgICAgICAgICAgIC8vICdjb25maWcoKSBNT0RVTE9fTU9ERSBvdXQgb2YgcmFuZ2U6IHt2fSdcbiAgICAgICAgICAgIGlmICggaGFzKCBwID0gJ01PRFVMT19NT0RFJyApICYmIGlzVmFsaWRJbnQoIHYsIDAsIDksIDIsIHAgKSApIHtcbiAgICAgICAgICAgICAgICBNT0RVTE9fTU9ERSA9IHYgfCAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcltwXSA9IE1PRFVMT19NT0RFO1xuXG4gICAgICAgICAgICAvLyBQT1dfUFJFQ0lTSU9OIHtudW1iZXJ9IEludGVnZXIsIDAgdG8gTUFYIGluY2x1c2l2ZS5cbiAgICAgICAgICAgIC8vICdjb25maWcoKSBQT1dfUFJFQ0lTSU9OIG5vdCBhbiBpbnRlZ2VyOiB7dn0nXG4gICAgICAgICAgICAvLyAnY29uZmlnKCkgUE9XX1BSRUNJU0lPTiBvdXQgb2YgcmFuZ2U6IHt2fSdcbiAgICAgICAgICAgIGlmICggaGFzKCBwID0gJ1BPV19QUkVDSVNJT04nICkgJiYgaXNWYWxpZEludCggdiwgMCwgTUFYLCAyLCBwICkgKSB7XG4gICAgICAgICAgICAgICAgUE9XX1BSRUNJU0lPTiA9IHYgfCAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcltwXSA9IFBPV19QUkVDSVNJT047XG5cbiAgICAgICAgICAgIC8vIEZPUk1BVCB7b2JqZWN0fVxuICAgICAgICAgICAgLy8gJ2NvbmZpZygpIEZPUk1BVCBub3QgYW4gb2JqZWN0OiB7dn0nXG4gICAgICAgICAgICBpZiAoIGhhcyggcCA9ICdGT1JNQVQnICkgKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoIHR5cGVvZiB2ID09ICdvYmplY3QnICkge1xuICAgICAgICAgICAgICAgICAgICBGT1JNQVQgPSB2O1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoRVJST1JTKSB7XG4gICAgICAgICAgICAgICAgICAgIHJhaXNlKCAyLCBwICsgJyBub3QgYW4gb2JqZWN0JywgdiApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJbcF0gPSBGT1JNQVQ7XG5cbiAgICAgICAgICAgIHJldHVybiByO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgbWF4aW11bSBvZiB0aGUgYXJndW1lbnRzLlxuICAgICAgICAgKlxuICAgICAgICAgKiBhcmd1bWVudHMge251bWJlcnxzdHJpbmd8QmlnTnVtYmVyfVxuICAgICAgICAgKi9cbiAgICAgICAgQmlnTnVtYmVyLm1heCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuIG1heE9yTWluKCBhcmd1bWVudHMsIFAubHQgKTsgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIG5ldyBCaWdOdW1iZXIgd2hvc2UgdmFsdWUgaXMgdGhlIG1pbmltdW0gb2YgdGhlIGFyZ3VtZW50cy5cbiAgICAgICAgICpcbiAgICAgICAgICogYXJndW1lbnRzIHtudW1iZXJ8c3RyaW5nfEJpZ051bWJlcn1cbiAgICAgICAgICovXG4gICAgICAgIEJpZ051bWJlci5taW4gPSBmdW5jdGlvbiAoKSB7IHJldHVybiBtYXhPck1pbiggYXJndW1lbnRzLCBQLmd0ICk7IH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdpdGggYSByYW5kb20gdmFsdWUgZXF1YWwgdG8gb3IgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxLFxuICAgICAgICAgKiBhbmQgd2l0aCBkcCwgb3IgREVDSU1BTF9QTEFDRVMgaWYgZHAgaXMgb21pdHRlZCwgZGVjaW1hbCBwbGFjZXMgKG9yIGxlc3MgaWYgdHJhaWxpbmdcbiAgICAgICAgICogemVyb3MgYXJlIHByb2R1Y2VkKS5cbiAgICAgICAgICpcbiAgICAgICAgICogW2RwXSB7bnVtYmVyfSBEZWNpbWFsIHBsYWNlcy4gSW50ZWdlciwgMCB0byBNQVggaW5jbHVzaXZlLlxuICAgICAgICAgKlxuICAgICAgICAgKiAncmFuZG9tKCkgZGVjaW1hbCBwbGFjZXMgbm90IGFuIGludGVnZXI6IHtkcH0nXG4gICAgICAgICAqICdyYW5kb20oKSBkZWNpbWFsIHBsYWNlcyBvdXQgb2YgcmFuZ2U6IHtkcH0nXG4gICAgICAgICAqICdyYW5kb20oKSBjcnlwdG8gdW5hdmFpbGFibGU6IHtjcnlwdG99J1xuICAgICAgICAgKi9cbiAgICAgICAgQmlnTnVtYmVyLnJhbmRvbSA9IChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgcG93Ml81MyA9IDB4MjAwMDAwMDAwMDAwMDA7XG5cbiAgICAgICAgICAgIC8vIFJldHVybiBhIDUzIGJpdCBpbnRlZ2VyIG4sIHdoZXJlIDAgPD0gbiA8IDkwMDcxOTkyNTQ3NDA5OTIuXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBNYXRoLnJhbmRvbSgpIHByb2R1Y2VzIG1vcmUgdGhhbiAzMiBiaXRzIG9mIHJhbmRvbW5lc3MuXG4gICAgICAgICAgICAvLyBJZiBpdCBkb2VzLCBhc3N1bWUgYXQgbGVhc3QgNTMgYml0cyBhcmUgcHJvZHVjZWQsIG90aGVyd2lzZSBhc3N1bWUgYXQgbGVhc3QgMzAgYml0cy5cbiAgICAgICAgICAgIC8vIDB4NDAwMDAwMDAgaXMgMl4zMCwgMHg4MDAwMDAgaXMgMl4yMywgMHgxZmZmZmYgaXMgMl4yMSAtIDEuXG4gICAgICAgICAgICB2YXIgcmFuZG9tNTNiaXRJbnQgPSAoTWF0aC5yYW5kb20oKSAqIHBvdzJfNTMpICYgMHgxZmZmZmZcbiAgICAgICAgICAgICAgPyBmdW5jdGlvbiAoKSB7IHJldHVybiBtYXRoZmxvb3IoIE1hdGgucmFuZG9tKCkgKiBwb3cyXzUzICk7IH1cbiAgICAgICAgICAgICAgOiBmdW5jdGlvbiAoKSB7IHJldHVybiAoKE1hdGgucmFuZG9tKCkgKiAweDQwMDAwMDAwIHwgMCkgKiAweDgwMDAwMCkgK1xuICAgICAgICAgICAgICAgICAgKE1hdGgucmFuZG9tKCkgKiAweDgwMDAwMCB8IDApOyB9O1xuXG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGRwKSB7XG4gICAgICAgICAgICAgICAgdmFyIGEsIGIsIGUsIGssIHYsXG4gICAgICAgICAgICAgICAgICAgIGkgPSAwLFxuICAgICAgICAgICAgICAgICAgICBjID0gW10sXG4gICAgICAgICAgICAgICAgICAgIHJhbmQgPSBuZXcgQmlnTnVtYmVyKE9ORSk7XG5cbiAgICAgICAgICAgICAgICBkcCA9IGRwID09IG51bGwgfHwgIWlzVmFsaWRJbnQoIGRwLCAwLCBNQVgsIDE0ICkgPyBERUNJTUFMX1BMQUNFUyA6IGRwIHwgMDtcbiAgICAgICAgICAgICAgICBrID0gbWF0aGNlaWwoIGRwIC8gTE9HX0JBU0UgKTtcblxuICAgICAgICAgICAgICAgIGlmIChDUllQVE8pIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBCcm93c2VycyBzdXBwb3J0aW5nIGNyeXB0by5nZXRSYW5kb21WYWx1ZXMuXG4gICAgICAgICAgICAgICAgICAgIGlmICggY3J5cHRvICYmIGNyeXB0by5nZXRSYW5kb21WYWx1ZXMgKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGEgPSBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKCBuZXcgVWludDMyQXJyYXkoIGsgKj0gMiApICk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoIDsgaSA8IGs7ICkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gNTMgYml0czpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAoKE1hdGgucG93KDIsIDMyKSAtIDEpICogTWF0aC5wb3coMiwgMjEpKS50b1N0cmluZygyKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDExMTExIDExMTExMTExIDExMTExMTExIDExMTExMTExIDExMTAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gKChNYXRoLnBvdygyLCAzMikgLSAxKSA+Pj4gMTEpLnRvU3RyaW5nKDIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMTExMTEgMTExMTExMTEgMTExMTExMTFcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAweDIwMDAwIGlzIDJeMjEuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdiA9IGFbaV0gKiAweDIwMDAwICsgKGFbaSArIDFdID4+PiAxMSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBSZWplY3Rpb24gc2FtcGxpbmc6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMCA8PSB2IDwgOTAwNzE5OTI1NDc0MDk5MlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFByb2JhYmlsaXR5IHRoYXQgdiA+PSA5ZTE1LCBpc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDcxOTkyNTQ3NDA5OTIgLyA5MDA3MTk5MjU0NzQwOTkyIH49IDAuMDAwOCwgaS5lLiAxIGluIDEyNTFcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIHYgPj0gOWUxNSApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYiA9IGNyeXB0by5nZXRSYW5kb21WYWx1ZXMoIG5ldyBVaW50MzJBcnJheSgyKSApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhW2ldID0gYlswXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYVtpICsgMV0gPSBiWzFdO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMCA8PSB2IDw9IDg5OTk5OTk5OTk5OTk5OTlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMCA8PSAodiAlIDFlMTQpIDw9IDk5OTk5OTk5OTk5OTk5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGMucHVzaCggdiAlIDFlMTQgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaSArPSAyO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGkgPSBrIC8gMjtcblxuICAgICAgICAgICAgICAgICAgICAvLyBOb2RlLmpzIHN1cHBvcnRpbmcgY3J5cHRvLnJhbmRvbUJ5dGVzLlxuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCBjcnlwdG8gJiYgY3J5cHRvLnJhbmRvbUJ5dGVzICkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBidWZmZXJcbiAgICAgICAgICAgICAgICAgICAgICAgIGEgPSBjcnlwdG8ucmFuZG9tQnl0ZXMoIGsgKj0gNyApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKCA7IGkgPCBrOyApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDB4MTAwMDAwMDAwMDAwMCBpcyAyXjQ4LCAweDEwMDAwMDAwMDAwIGlzIDJeNDBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAweDEwMDAwMDAwMCBpcyAyXjMyLCAweDEwMDAwMDAgaXMgMl4yNFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIDExMTExIDExMTExMTExIDExMTExMTExIDExMTExMTExIDExMTExMTExIDExMTExMTExIDExMTExMTExXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gMCA8PSB2IDwgOTAwNzE5OTI1NDc0MDk5MlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHYgPSAoICggYVtpXSAmIDMxICkgKiAweDEwMDAwMDAwMDAwMDAgKSArICggYVtpICsgMV0gKiAweDEwMDAwMDAwMDAwICkgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICggYVtpICsgMl0gKiAweDEwMDAwMDAwMCApICsgKCBhW2kgKyAzXSAqIDB4MTAwMDAwMCApICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoIGFbaSArIDRdIDw8IDE2ICkgKyAoIGFbaSArIDVdIDw8IDggKSArIGFbaSArIDZdO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCB2ID49IDllMTUgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNyeXB0by5yYW5kb21CeXRlcyg3KS5jb3B5KCBhLCBpICk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAwIDw9ICh2ICUgMWUxNCkgPD0gOTk5OTk5OTk5OTk5OTlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYy5wdXNoKCB2ICUgMWUxNCApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpICs9IDc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaSA9IGsgLyA3O1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKEVSUk9SUykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmFpc2UoIDE0LCAnY3J5cHRvIHVuYXZhaWxhYmxlJywgY3J5cHRvICk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBVc2UgTWF0aC5yYW5kb206IENSWVBUTyBpcyBmYWxzZSBvciBjcnlwdG8gaXMgdW5hdmFpbGFibGUgYW5kIEVSUk9SUyBpcyBmYWxzZS5cbiAgICAgICAgICAgICAgICBpZiAoIWkpIHtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKCA7IGkgPCBrOyApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHYgPSByYW5kb201M2JpdEludCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCB2IDwgOWUxNSApIGNbaSsrXSA9IHYgJSAxZTE0O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgayA9IGNbLS1pXTtcbiAgICAgICAgICAgICAgICBkcCAlPSBMT0dfQkFTRTtcblxuICAgICAgICAgICAgICAgIC8vIENvbnZlcnQgdHJhaWxpbmcgZGlnaXRzIHRvIHplcm9zIGFjY29yZGluZyB0byBkcC5cbiAgICAgICAgICAgICAgICBpZiAoIGsgJiYgZHAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHYgPSBQT1dTX1RFTltMT0dfQkFTRSAtIGRwXTtcbiAgICAgICAgICAgICAgICAgICAgY1tpXSA9IG1hdGhmbG9vciggayAvIHYgKSAqIHY7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gUmVtb3ZlIHRyYWlsaW5nIGVsZW1lbnRzIHdoaWNoIGFyZSB6ZXJvLlxuICAgICAgICAgICAgICAgIGZvciAoIDsgY1tpXSA9PT0gMDsgYy5wb3AoKSwgaS0tICk7XG5cbiAgICAgICAgICAgICAgICAvLyBaZXJvP1xuICAgICAgICAgICAgICAgIGlmICggaSA8IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgIGMgPSBbIGUgPSAwIF07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBSZW1vdmUgbGVhZGluZyBlbGVtZW50cyB3aGljaCBhcmUgemVybyBhbmQgYWRqdXN0IGV4cG9uZW50IGFjY29yZGluZ2x5LlxuICAgICAgICAgICAgICAgICAgICBmb3IgKCBlID0gLTEgOyBjWzBdID09PSAwOyBjLnNoaWZ0KCksIGUgLT0gTE9HX0JBU0UpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIENvdW50IHRoZSBkaWdpdHMgb2YgdGhlIGZpcnN0IGVsZW1lbnQgb2YgYyB0byBkZXRlcm1pbmUgbGVhZGluZyB6ZXJvcywgYW5kLi4uXG4gICAgICAgICAgICAgICAgICAgIGZvciAoIGkgPSAxLCB2ID0gY1swXTsgdiA+PSAxMDsgdiAvPSAxMCwgaSsrKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBhZGp1c3QgdGhlIGV4cG9uZW50IGFjY29yZGluZ2x5LlxuICAgICAgICAgICAgICAgICAgICBpZiAoIGkgPCBMT0dfQkFTRSApIGUgLT0gTE9HX0JBU0UgLSBpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJhbmQuZSA9IGU7XG4gICAgICAgICAgICAgICAgcmFuZC5jID0gYztcbiAgICAgICAgICAgICAgICByZXR1cm4gcmFuZDtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0pKCk7XG5cblxuICAgICAgICAvLyBQUklWQVRFIEZVTkNUSU9OU1xuXG5cbiAgICAgICAgLy8gQ29udmVydCBhIG51bWVyaWMgc3RyaW5nIG9mIGJhc2VJbiB0byBhIG51bWVyaWMgc3RyaW5nIG9mIGJhc2VPdXQuXG4gICAgICAgIGZ1bmN0aW9uIGNvbnZlcnRCYXNlKCBzdHIsIGJhc2VPdXQsIGJhc2VJbiwgc2lnbiApIHtcbiAgICAgICAgICAgIHZhciBkLCBlLCBrLCByLCB4LCB4YywgeSxcbiAgICAgICAgICAgICAgICBpID0gc3RyLmluZGV4T2YoICcuJyApLFxuICAgICAgICAgICAgICAgIGRwID0gREVDSU1BTF9QTEFDRVMsXG4gICAgICAgICAgICAgICAgcm0gPSBST1VORElOR19NT0RFO1xuXG4gICAgICAgICAgICBpZiAoIGJhc2VJbiA8IDM3ICkgc3RyID0gc3RyLnRvTG93ZXJDYXNlKCk7XG5cbiAgICAgICAgICAgIC8vIE5vbi1pbnRlZ2VyLlxuICAgICAgICAgICAgaWYgKCBpID49IDAgKSB7XG4gICAgICAgICAgICAgICAgayA9IFBPV19QUkVDSVNJT047XG5cbiAgICAgICAgICAgICAgICAvLyBVbmxpbWl0ZWQgcHJlY2lzaW9uLlxuICAgICAgICAgICAgICAgIFBPV19QUkVDSVNJT04gPSAwO1xuICAgICAgICAgICAgICAgIHN0ciA9IHN0ci5yZXBsYWNlKCAnLicsICcnICk7XG4gICAgICAgICAgICAgICAgeSA9IG5ldyBCaWdOdW1iZXIoYmFzZUluKTtcbiAgICAgICAgICAgICAgICB4ID0geS5wb3coIHN0ci5sZW5ndGggLSBpICk7XG4gICAgICAgICAgICAgICAgUE9XX1BSRUNJU0lPTiA9IGs7XG5cbiAgICAgICAgICAgICAgICAvLyBDb252ZXJ0IHN0ciBhcyBpZiBhbiBpbnRlZ2VyLCB0aGVuIHJlc3RvcmUgdGhlIGZyYWN0aW9uIHBhcnQgYnkgZGl2aWRpbmcgdGhlXG4gICAgICAgICAgICAgICAgLy8gcmVzdWx0IGJ5IGl0cyBiYXNlIHJhaXNlZCB0byBhIHBvd2VyLlxuICAgICAgICAgICAgICAgIHkuYyA9IHRvQmFzZU91dCggdG9GaXhlZFBvaW50KCBjb2VmZlRvU3RyaW5nKCB4LmMgKSwgeC5lICksIDEwLCBiYXNlT3V0ICk7XG4gICAgICAgICAgICAgICAgeS5lID0geS5jLmxlbmd0aDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQ29udmVydCB0aGUgbnVtYmVyIGFzIGludGVnZXIuXG4gICAgICAgICAgICB4YyA9IHRvQmFzZU91dCggc3RyLCBiYXNlSW4sIGJhc2VPdXQgKTtcbiAgICAgICAgICAgIGUgPSBrID0geGMubGVuZ3RoO1xuXG4gICAgICAgICAgICAvLyBSZW1vdmUgdHJhaWxpbmcgemVyb3MuXG4gICAgICAgICAgICBmb3IgKCA7IHhjWy0ta10gPT0gMDsgeGMucG9wKCkgKTtcbiAgICAgICAgICAgIGlmICggIXhjWzBdICkgcmV0dXJuICcwJztcblxuICAgICAgICAgICAgaWYgKCBpIDwgMCApIHtcbiAgICAgICAgICAgICAgICAtLWU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHguYyA9IHhjO1xuICAgICAgICAgICAgICAgIHguZSA9IGU7XG5cbiAgICAgICAgICAgICAgICAvLyBzaWduIGlzIG5lZWRlZCBmb3IgY29ycmVjdCByb3VuZGluZy5cbiAgICAgICAgICAgICAgICB4LnMgPSBzaWduO1xuICAgICAgICAgICAgICAgIHggPSBkaXYoIHgsIHksIGRwLCBybSwgYmFzZU91dCApO1xuICAgICAgICAgICAgICAgIHhjID0geC5jO1xuICAgICAgICAgICAgICAgIHIgPSB4LnI7XG4gICAgICAgICAgICAgICAgZSA9IHguZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZCA9IGUgKyBkcCArIDE7XG5cbiAgICAgICAgICAgIC8vIFRoZSByb3VuZGluZyBkaWdpdCwgaS5lLiB0aGUgZGlnaXQgdG8gdGhlIHJpZ2h0IG9mIHRoZSBkaWdpdCB0aGF0IG1heSBiZSByb3VuZGVkIHVwLlxuICAgICAgICAgICAgaSA9IHhjW2RdO1xuICAgICAgICAgICAgayA9IGJhc2VPdXQgLyAyO1xuICAgICAgICAgICAgciA9IHIgfHwgZCA8IDAgfHwgeGNbZCArIDFdICE9IG51bGw7XG5cbiAgICAgICAgICAgIHIgPSBybSA8IDQgPyAoIGkgIT0gbnVsbCB8fCByICkgJiYgKCBybSA9PSAwIHx8IHJtID09ICggeC5zIDwgMCA/IDMgOiAyICkgKVxuICAgICAgICAgICAgICAgICAgICAgICA6IGkgPiBrIHx8IGkgPT0gayAmJiggcm0gPT0gNCB8fCByIHx8IHJtID09IDYgJiYgeGNbZCAtIDFdICYgMSB8fFxuICAgICAgICAgICAgICAgICAgICAgICAgIHJtID09ICggeC5zIDwgMCA/IDggOiA3ICkgKTtcblxuICAgICAgICAgICAgaWYgKCBkIDwgMSB8fCAheGNbMF0gKSB7XG5cbiAgICAgICAgICAgICAgICAvLyAxXi1kcCBvciAwLlxuICAgICAgICAgICAgICAgIHN0ciA9IHIgPyB0b0ZpeGVkUG9pbnQoICcxJywgLWRwICkgOiAnMCc7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHhjLmxlbmd0aCA9IGQ7XG5cbiAgICAgICAgICAgICAgICBpZiAocikge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJvdW5kaW5nIHVwIG1heSBtZWFuIHRoZSBwcmV2aW91cyBkaWdpdCBoYXMgdG8gYmUgcm91bmRlZCB1cCBhbmQgc28gb24uXG4gICAgICAgICAgICAgICAgICAgIGZvciAoIC0tYmFzZU91dDsgKyt4Y1stLWRdID4gYmFzZU91dDsgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4Y1tkXSA9IDA7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICggIWQgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKytlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHhjLnVuc2hpZnQoMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBEZXRlcm1pbmUgdHJhaWxpbmcgemVyb3MuXG4gICAgICAgICAgICAgICAgZm9yICggayA9IHhjLmxlbmd0aDsgIXhjWy0ta107ICk7XG5cbiAgICAgICAgICAgICAgICAvLyBFLmcuIFs0LCAxMSwgMTVdIGJlY29tZXMgNGJmLlxuICAgICAgICAgICAgICAgIGZvciAoIGkgPSAwLCBzdHIgPSAnJzsgaSA8PSBrOyBzdHIgKz0gQUxQSEFCRVQuY2hhckF0KCB4Y1tpKytdICkgKTtcbiAgICAgICAgICAgICAgICBzdHIgPSB0b0ZpeGVkUG9pbnQoIHN0ciwgZSApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBUaGUgY2FsbGVyIHdpbGwgYWRkIHRoZSBzaWduLlxuICAgICAgICAgICAgcmV0dXJuIHN0cjtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gUGVyZm9ybSBkaXZpc2lvbiBpbiB0aGUgc3BlY2lmaWVkIGJhc2UuIENhbGxlZCBieSBkaXYgYW5kIGNvbnZlcnRCYXNlLlxuICAgICAgICBkaXYgPSAoZnVuY3Rpb24gKCkge1xuXG4gICAgICAgICAgICAvLyBBc3N1bWUgbm9uLXplcm8geCBhbmQgay5cbiAgICAgICAgICAgIGZ1bmN0aW9uIG11bHRpcGx5KCB4LCBrLCBiYXNlICkge1xuICAgICAgICAgICAgICAgIHZhciBtLCB0ZW1wLCB4bG8sIHhoaSxcbiAgICAgICAgICAgICAgICAgICAgY2FycnkgPSAwLFxuICAgICAgICAgICAgICAgICAgICBpID0geC5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGtsbyA9IGsgJSBTUVJUX0JBU0UsXG4gICAgICAgICAgICAgICAgICAgIGtoaSA9IGsgLyBTUVJUX0JBU0UgfCAwO1xuXG4gICAgICAgICAgICAgICAgZm9yICggeCA9IHguc2xpY2UoKTsgaS0tOyApIHtcbiAgICAgICAgICAgICAgICAgICAgeGxvID0geFtpXSAlIFNRUlRfQkFTRTtcbiAgICAgICAgICAgICAgICAgICAgeGhpID0geFtpXSAvIFNRUlRfQkFTRSB8IDA7XG4gICAgICAgICAgICAgICAgICAgIG0gPSBraGkgKiB4bG8gKyB4aGkgKiBrbG87XG4gICAgICAgICAgICAgICAgICAgIHRlbXAgPSBrbG8gKiB4bG8gKyAoICggbSAlIFNRUlRfQkFTRSApICogU1FSVF9CQVNFICkgKyBjYXJyeTtcbiAgICAgICAgICAgICAgICAgICAgY2FycnkgPSAoIHRlbXAgLyBiYXNlIHwgMCApICsgKCBtIC8gU1FSVF9CQVNFIHwgMCApICsga2hpICogeGhpO1xuICAgICAgICAgICAgICAgICAgICB4W2ldID0gdGVtcCAlIGJhc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGNhcnJ5KSB4LnVuc2hpZnQoY2FycnkpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIGNvbXBhcmUoIGEsIGIsIGFMLCBiTCApIHtcbiAgICAgICAgICAgICAgICB2YXIgaSwgY21wO1xuXG4gICAgICAgICAgICAgICAgaWYgKCBhTCAhPSBiTCApIHtcbiAgICAgICAgICAgICAgICAgICAgY21wID0gYUwgPiBiTCA/IDEgOiAtMTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoIGkgPSBjbXAgPSAwOyBpIDwgYUw7IGkrKyApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCBhW2ldICE9IGJbaV0gKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY21wID0gYVtpXSA+IGJbaV0gPyAxIDogLTE7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNtcDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gc3VidHJhY3QoIGEsIGIsIGFMLCBiYXNlICkge1xuICAgICAgICAgICAgICAgIHZhciBpID0gMDtcblxuICAgICAgICAgICAgICAgIC8vIFN1YnRyYWN0IGIgZnJvbSBhLlxuICAgICAgICAgICAgICAgIGZvciAoIDsgYUwtLTsgKSB7XG4gICAgICAgICAgICAgICAgICAgIGFbYUxdIC09IGk7XG4gICAgICAgICAgICAgICAgICAgIGkgPSBhW2FMXSA8IGJbYUxdID8gMSA6IDA7XG4gICAgICAgICAgICAgICAgICAgIGFbYUxdID0gaSAqIGJhc2UgKyBhW2FMXSAtIGJbYUxdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBsZWFkaW5nIHplcm9zLlxuICAgICAgICAgICAgICAgIGZvciAoIDsgIWFbMF0gJiYgYS5sZW5ndGggPiAxOyBhLnNoaWZ0KCkgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8geDogZGl2aWRlbmQsIHk6IGRpdmlzb3IuXG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCB4LCB5LCBkcCwgcm0sIGJhc2UgKSB7XG4gICAgICAgICAgICAgICAgdmFyIGNtcCwgZSwgaSwgbW9yZSwgbiwgcHJvZCwgcHJvZEwsIHEsIHFjLCByZW0sIHJlbUwsIHJlbTAsIHhpLCB4TCwgeWMwLFxuICAgICAgICAgICAgICAgICAgICB5TCwgeXosXG4gICAgICAgICAgICAgICAgICAgIHMgPSB4LnMgPT0geS5zID8gMSA6IC0xLFxuICAgICAgICAgICAgICAgICAgICB4YyA9IHguYyxcbiAgICAgICAgICAgICAgICAgICAgeWMgPSB5LmM7XG5cbiAgICAgICAgICAgICAgICAvLyBFaXRoZXIgTmFOLCBJbmZpbml0eSBvciAwP1xuICAgICAgICAgICAgICAgIGlmICggIXhjIHx8ICF4Y1swXSB8fCAheWMgfHwgIXljWzBdICkge1xuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgQmlnTnVtYmVyKFxuXG4gICAgICAgICAgICAgICAgICAgICAgLy8gUmV0dXJuIE5hTiBpZiBlaXRoZXIgTmFOLCBvciBib3RoIEluZmluaXR5IG9yIDAuXG4gICAgICAgICAgICAgICAgICAgICAgIXgucyB8fCAheS5zIHx8ICggeGMgPyB5YyAmJiB4Y1swXSA9PSB5Y1swXSA6ICF5YyApID8gTmFOIDpcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gUmV0dXJuIMKxMCBpZiB4IGlzIMKxMCBvciB5IGlzIMKxSW5maW5pdHksIG9yIHJldHVybiDCsUluZmluaXR5IGFzIHkgaXMgwrEwLlxuICAgICAgICAgICAgICAgICAgICAgICAgeGMgJiYgeGNbMF0gPT0gMCB8fCAheWMgPyBzICogMCA6IHMgLyAwXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcSA9IG5ldyBCaWdOdW1iZXIocyk7XG4gICAgICAgICAgICAgICAgcWMgPSBxLmMgPSBbXTtcbiAgICAgICAgICAgICAgICBlID0geC5lIC0geS5lO1xuICAgICAgICAgICAgICAgIHMgPSBkcCArIGUgKyAxO1xuXG4gICAgICAgICAgICAgICAgaWYgKCAhYmFzZSApIHtcbiAgICAgICAgICAgICAgICAgICAgYmFzZSA9IEJBU0U7XG4gICAgICAgICAgICAgICAgICAgIGUgPSBiaXRGbG9vciggeC5lIC8gTE9HX0JBU0UgKSAtIGJpdEZsb29yKCB5LmUgLyBMT0dfQkFTRSApO1xuICAgICAgICAgICAgICAgICAgICBzID0gcyAvIExPR19CQVNFIHwgMDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBSZXN1bHQgZXhwb25lbnQgbWF5IGJlIG9uZSBsZXNzIHRoZW4gdGhlIGN1cnJlbnQgdmFsdWUgb2YgZS5cbiAgICAgICAgICAgICAgICAvLyBUaGUgY29lZmZpY2llbnRzIG9mIHRoZSBCaWdOdW1iZXJzIGZyb20gY29udmVydEJhc2UgbWF5IGhhdmUgdHJhaWxpbmcgemVyb3MuXG4gICAgICAgICAgICAgICAgZm9yICggaSA9IDA7IHljW2ldID09ICggeGNbaV0gfHwgMCApOyBpKysgKTtcbiAgICAgICAgICAgICAgICBpZiAoIHljW2ldID4gKCB4Y1tpXSB8fCAwICkgKSBlLS07XG5cbiAgICAgICAgICAgICAgICBpZiAoIHMgPCAwICkge1xuICAgICAgICAgICAgICAgICAgICBxYy5wdXNoKDEpO1xuICAgICAgICAgICAgICAgICAgICBtb3JlID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB4TCA9IHhjLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgeUwgPSB5Yy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIGkgPSAwO1xuICAgICAgICAgICAgICAgICAgICBzICs9IDI7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gTm9ybWFsaXNlIHhjIGFuZCB5YyBzbyBoaWdoZXN0IG9yZGVyIGRpZ2l0IG9mIHljIGlzID49IGJhc2UgLyAyLlxuXG4gICAgICAgICAgICAgICAgICAgIG4gPSBtYXRoZmxvb3IoIGJhc2UgLyAoIHljWzBdICsgMSApICk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gTm90IG5lY2Vzc2FyeSwgYnV0IHRvIGhhbmRsZSBvZGQgYmFzZXMgd2hlcmUgeWNbMF0gPT0gKCBiYXNlIC8gMiApIC0gMS5cbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgKCBuID4gMSB8fCBuKysgPT0gMSAmJiB5Y1swXSA8IGJhc2UgLyAyICkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoIG4gPiAxICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgeWMgPSBtdWx0aXBseSggeWMsIG4sIGJhc2UgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHhjID0gbXVsdGlwbHkoIHhjLCBuLCBiYXNlICk7XG4gICAgICAgICAgICAgICAgICAgICAgICB5TCA9IHljLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHhMID0geGMubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgeGkgPSB5TDtcbiAgICAgICAgICAgICAgICAgICAgcmVtID0geGMuc2xpY2UoIDAsIHlMICk7XG4gICAgICAgICAgICAgICAgICAgIHJlbUwgPSByZW0ubGVuZ3RoO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFkZCB6ZXJvcyB0byBtYWtlIHJlbWFpbmRlciBhcyBsb25nIGFzIGRpdmlzb3IuXG4gICAgICAgICAgICAgICAgICAgIGZvciAoIDsgcmVtTCA8IHlMOyByZW1bcmVtTCsrXSA9IDAgKTtcbiAgICAgICAgICAgICAgICAgICAgeXogPSB5Yy5zbGljZSgpO1xuICAgICAgICAgICAgICAgICAgICB5ei51bnNoaWZ0KDApO1xuICAgICAgICAgICAgICAgICAgICB5YzAgPSB5Y1swXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCB5Y1sxXSA+PSBiYXNlIC8gMiApIHljMCsrO1xuICAgICAgICAgICAgICAgICAgICAvLyBOb3QgbmVjZXNzYXJ5LCBidXQgdG8gcHJldmVudCB0cmlhbCBkaWdpdCBuID4gYmFzZSwgd2hlbiB1c2luZyBiYXNlIDMuXG4gICAgICAgICAgICAgICAgICAgIC8vIGVsc2UgaWYgKCBiYXNlID09IDMgJiYgeWMwID09IDEgKSB5YzAgPSAxICsgMWUtMTU7XG5cbiAgICAgICAgICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgICAgICAgICAgbiA9IDA7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENvbXBhcmUgZGl2aXNvciBhbmQgcmVtYWluZGVyLlxuICAgICAgICAgICAgICAgICAgICAgICAgY21wID0gY29tcGFyZSggeWMsIHJlbSwgeUwsIHJlbUwgKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgZGl2aXNvciA8IHJlbWFpbmRlci5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICggY21wIDwgMCApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIENhbGN1bGF0ZSB0cmlhbCBkaWdpdCwgbi5cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlbTAgPSByZW1bMF07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCB5TCAhPSByZW1MICkgcmVtMCA9IHJlbTAgKiBiYXNlICsgKCByZW1bMV0gfHwgMCApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbiBpcyBob3cgbWFueSB0aW1lcyB0aGUgZGl2aXNvciBnb2VzIGludG8gdGhlIGN1cnJlbnQgcmVtYWluZGVyLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG4gPSBtYXRoZmxvb3IoIHJlbTAgLyB5YzAgKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICBBbGdvcml0aG06XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gIDEuIHByb2R1Y3QgPSBkaXZpc29yICogdHJpYWwgZGlnaXQgKG4pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gIDIuIGlmIHByb2R1Y3QgPiByZW1haW5kZXI6IHByb2R1Y3QgLT0gZGl2aXNvciwgbi0tXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gIDMuIHJlbWFpbmRlciAtPSBwcm9kdWN0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gIDQuIGlmIHByb2R1Y3Qgd2FzIDwgcmVtYWluZGVyIGF0IDI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgNS4gY29tcGFyZSBuZXcgcmVtYWluZGVyIGFuZCBkaXZpc29yXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgNi4gSWYgcmVtYWluZGVyID4gZGl2aXNvcjogcmVtYWluZGVyIC09IGRpdmlzb3IsIG4rK1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCBuID4gMSApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBuIG1heSBiZSA+IGJhc2Ugb25seSB3aGVuIGJhc2UgaXMgMy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG4gPj0gYmFzZSkgbiA9IGJhc2UgLSAxO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHByb2R1Y3QgPSBkaXZpc29yICogdHJpYWwgZGlnaXQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2QgPSBtdWx0aXBseSggeWMsIG4sIGJhc2UgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZEwgPSBwcm9kLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtTCA9IHJlbS5sZW5ndGg7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ29tcGFyZSBwcm9kdWN0IGFuZCByZW1haW5kZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIHByb2R1Y3QgPiByZW1haW5kZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRyaWFsIGRpZ2l0IG4gdG9vIGhpZ2guXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG4gaXMgMSB0b28gaGlnaCBhYm91dCA1JSBvZiB0aGUgdGltZSwgYW5kIGlzIG5vdCBrbm93biB0byBoYXZlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGV2ZXIgYmVlbiBtb3JlIHRoYW4gMSB0b28gaGlnaC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2hpbGUgKCBjb21wYXJlKCBwcm9kLCByZW0sIHByb2RMLCByZW1MICkgPT0gMSApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG4tLTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gU3VidHJhY3QgZGl2aXNvciBmcm9tIHByb2R1Y3QuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJ0cmFjdCggcHJvZCwgeUwgPCBwcm9kTCA/IHl6IDogeWMsIHByb2RMLCBiYXNlICk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9kTCA9IHByb2QubGVuZ3RoO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY21wID0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gbiBpcyAwIG9yIDEsIGNtcCBpcyAtMS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgbiBpcyAwLCB0aGVyZSBpcyBubyBuZWVkIHRvIGNvbXBhcmUgeWMgYW5kIHJlbSBhZ2FpbiBiZWxvdyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gc28gY2hhbmdlIGNtcCB0byAxIHRvIGF2b2lkIGl0LlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiBuIGlzIDEsIGxlYXZlIGNtcCBhcyAtMSwgc28geWMgYW5kIHJlbSBhcmUgY29tcGFyZWQgYWdhaW4uXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICggbiA9PSAwICkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBkaXZpc29yIDwgcmVtYWluZGVyLCBzbyBuIG11c3QgYmUgYXQgbGVhc3QgMS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNtcCA9IG4gPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gcHJvZHVjdCA9IGRpdmlzb3JcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvZCA9IHljLnNsaWNlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2RMID0gcHJvZC5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCBwcm9kTCA8IHJlbUwgKSBwcm9kLnVuc2hpZnQoMCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBTdWJ0cmFjdCBwcm9kdWN0IGZyb20gcmVtYWluZGVyLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1YnRyYWN0KCByZW0sIHByb2QsIHJlbUwsIGJhc2UgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZW1MID0gcmVtLmxlbmd0aDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBJZiBwcm9kdWN0IHdhcyA8IHJlbWFpbmRlci5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIGNtcCA9PSAtMSApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBDb21wYXJlIGRpdmlzb3IgYW5kIG5ldyByZW1haW5kZXIuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIGRpdmlzb3IgPCBuZXcgcmVtYWluZGVyLCBzdWJ0cmFjdCBkaXZpc29yIGZyb20gcmVtYWluZGVyLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUcmlhbCBkaWdpdCBuIHRvbyBsb3cuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIG4gaXMgMSB0b28gbG93IGFib3V0IDUlIG9mIHRoZSB0aW1lLCBhbmQgdmVyeSByYXJlbHkgMiB0b28gbG93LlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGlsZSAoIGNvbXBhcmUoIHljLCByZW0sIHlMLCByZW1MICkgPCAxICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbisrO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBTdWJ0cmFjdCBkaXZpc29yIGZyb20gcmVtYWluZGVyLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VidHJhY3QoIHJlbSwgeUwgPCByZW1MID8geXogOiB5YywgcmVtTCwgYmFzZSApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtTCA9IHJlbS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCBjbXAgPT09IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbisrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlbSA9IFswXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gLy8gZWxzZSBjbXAgPT09IDEgYW5kIG4gd2lsbCBiZSAwXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEFkZCB0aGUgbmV4dCBkaWdpdCwgbiwgdG8gdGhlIHJlc3VsdCBhcnJheS5cbiAgICAgICAgICAgICAgICAgICAgICAgIHFjW2krK10gPSBuO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBVcGRhdGUgdGhlIHJlbWFpbmRlci5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICggcmVtWzBdICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlbVtyZW1MKytdID0geGNbeGldIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlbSA9IFsgeGNbeGldIF07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtTCA9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gd2hpbGUgKCAoIHhpKysgPCB4TCB8fCByZW1bMF0gIT0gbnVsbCApICYmIHMtLSApO1xuXG4gICAgICAgICAgICAgICAgICAgIG1vcmUgPSByZW1bMF0gIT0gbnVsbDtcblxuICAgICAgICAgICAgICAgICAgICAvLyBMZWFkaW5nIHplcm8/XG4gICAgICAgICAgICAgICAgICAgIGlmICggIXFjWzBdICkgcWMuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoIGJhc2UgPT0gQkFTRSApIHtcblxuICAgICAgICAgICAgICAgICAgICAvLyBUbyBjYWxjdWxhdGUgcS5lLCBmaXJzdCBnZXQgdGhlIG51bWJlciBvZiBkaWdpdHMgb2YgcWNbMF0uXG4gICAgICAgICAgICAgICAgICAgIGZvciAoIGkgPSAxLCBzID0gcWNbMF07IHMgPj0gMTA7IHMgLz0gMTAsIGkrKyApO1xuICAgICAgICAgICAgICAgICAgICByb3VuZCggcSwgZHAgKyAoIHEuZSA9IGkgKyBlICogTE9HX0JBU0UgLSAxICkgKyAxLCBybSwgbW9yZSApO1xuXG4gICAgICAgICAgICAgICAgLy8gQ2FsbGVyIGlzIGNvbnZlcnRCYXNlLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHEuZSA9IGU7XG4gICAgICAgICAgICAgICAgICAgIHEuciA9ICttb3JlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiBxO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSkoKTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIHZhbHVlIG9mIEJpZ051bWJlciBuIGluIGZpeGVkLXBvaW50IG9yIGV4cG9uZW50aWFsXG4gICAgICAgICAqIG5vdGF0aW9uIHJvdW5kZWQgdG8gdGhlIHNwZWNpZmllZCBkZWNpbWFsIHBsYWNlcyBvciBzaWduaWZpY2FudCBkaWdpdHMuXG4gICAgICAgICAqXG4gICAgICAgICAqIG4gaXMgYSBCaWdOdW1iZXIuXG4gICAgICAgICAqIGkgaXMgdGhlIGluZGV4IG9mIHRoZSBsYXN0IGRpZ2l0IHJlcXVpcmVkIChpLmUuIHRoZSBkaWdpdCB0aGF0IG1heSBiZSByb3VuZGVkIHVwKS5cbiAgICAgICAgICogcm0gaXMgdGhlIHJvdW5kaW5nIG1vZGUuXG4gICAgICAgICAqIGNhbGxlciBpcyBjYWxsZXIgaWQ6IHRvRXhwb25lbnRpYWwgMTksIHRvRml4ZWQgMjAsIHRvRm9ybWF0IDIxLCB0b1ByZWNpc2lvbiAyNC5cbiAgICAgICAgICovXG4gICAgICAgIGZ1bmN0aW9uIGZvcm1hdCggbiwgaSwgcm0sIGNhbGxlciApIHtcbiAgICAgICAgICAgIHZhciBjMCwgZSwgbmUsIGxlbiwgc3RyO1xuXG4gICAgICAgICAgICBybSA9IHJtICE9IG51bGwgJiYgaXNWYWxpZEludCggcm0sIDAsIDgsIGNhbGxlciwgcm91bmRpbmdNb2RlIClcbiAgICAgICAgICAgICAgPyBybSB8IDAgOiBST1VORElOR19NT0RFO1xuXG4gICAgICAgICAgICBpZiAoICFuLmMgKSByZXR1cm4gbi50b1N0cmluZygpO1xuICAgICAgICAgICAgYzAgPSBuLmNbMF07XG4gICAgICAgICAgICBuZSA9IG4uZTtcblxuICAgICAgICAgICAgaWYgKCBpID09IG51bGwgKSB7XG4gICAgICAgICAgICAgICAgc3RyID0gY29lZmZUb1N0cmluZyggbi5jICk7XG4gICAgICAgICAgICAgICAgc3RyID0gY2FsbGVyID09IDE5IHx8IGNhbGxlciA9PSAyNCAmJiBuZSA8PSBUT19FWFBfTkVHXG4gICAgICAgICAgICAgICAgICA/IHRvRXhwb25lbnRpYWwoIHN0ciwgbmUgKVxuICAgICAgICAgICAgICAgICAgOiB0b0ZpeGVkUG9pbnQoIHN0ciwgbmUgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbiA9IHJvdW5kKCBuZXcgQmlnTnVtYmVyKG4pLCBpLCBybSApO1xuXG4gICAgICAgICAgICAgICAgLy8gbi5lIG1heSBoYXZlIGNoYW5nZWQgaWYgdGhlIHZhbHVlIHdhcyByb3VuZGVkIHVwLlxuICAgICAgICAgICAgICAgIGUgPSBuLmU7XG5cbiAgICAgICAgICAgICAgICBzdHIgPSBjb2VmZlRvU3RyaW5nKCBuLmMgKTtcbiAgICAgICAgICAgICAgICBsZW4gPSBzdHIubGVuZ3RoO1xuXG4gICAgICAgICAgICAgICAgLy8gdG9QcmVjaXNpb24gcmV0dXJucyBleHBvbmVudGlhbCBub3RhdGlvbiBpZiB0aGUgbnVtYmVyIG9mIHNpZ25pZmljYW50IGRpZ2l0c1xuICAgICAgICAgICAgICAgIC8vIHNwZWNpZmllZCBpcyBsZXNzIHRoYW4gdGhlIG51bWJlciBvZiBkaWdpdHMgbmVjZXNzYXJ5IHRvIHJlcHJlc2VudCB0aGUgaW50ZWdlclxuICAgICAgICAgICAgICAgIC8vIHBhcnQgb2YgdGhlIHZhbHVlIGluIGZpeGVkLXBvaW50IG5vdGF0aW9uLlxuXG4gICAgICAgICAgICAgICAgLy8gRXhwb25lbnRpYWwgbm90YXRpb24uXG4gICAgICAgICAgICAgICAgaWYgKCBjYWxsZXIgPT0gMTkgfHwgY2FsbGVyID09IDI0ICYmICggaSA8PSBlIHx8IGUgPD0gVE9fRVhQX05FRyApICkge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEFwcGVuZCB6ZXJvcz9cbiAgICAgICAgICAgICAgICAgICAgZm9yICggOyBsZW4gPCBpOyBzdHIgKz0gJzAnLCBsZW4rKyApO1xuICAgICAgICAgICAgICAgICAgICBzdHIgPSB0b0V4cG9uZW50aWFsKCBzdHIsIGUgKTtcblxuICAgICAgICAgICAgICAgIC8vIEZpeGVkLXBvaW50IG5vdGF0aW9uLlxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGkgLT0gbmU7XG4gICAgICAgICAgICAgICAgICAgIHN0ciA9IHRvRml4ZWRQb2ludCggc3RyLCBlICk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQXBwZW5kIHplcm9zP1xuICAgICAgICAgICAgICAgICAgICBpZiAoIGUgKyAxID4gbGVuICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCAtLWkgPiAwICkgZm9yICggc3RyICs9ICcuJzsgaS0tOyBzdHIgKz0gJzAnICk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpICs9IGUgLSBsZW47XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIGkgPiAwICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICggZSArIDEgPT0gbGVuICkgc3RyICs9ICcuJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKCA7IGktLTsgc3RyICs9ICcwJyApO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gbi5zIDwgMCAmJiBjMCA/ICctJyArIHN0ciA6IHN0cjtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSGFuZGxlIEJpZ051bWJlci5tYXggYW5kIEJpZ051bWJlci5taW4uXG4gICAgICAgIGZ1bmN0aW9uIG1heE9yTWluKCBhcmdzLCBtZXRob2QgKSB7XG4gICAgICAgICAgICB2YXIgbSwgbixcbiAgICAgICAgICAgICAgICBpID0gMDtcblxuICAgICAgICAgICAgaWYgKCBpc0FycmF5KCBhcmdzWzBdICkgKSBhcmdzID0gYXJnc1swXTtcbiAgICAgICAgICAgIG0gPSBuZXcgQmlnTnVtYmVyKCBhcmdzWzBdICk7XG5cbiAgICAgICAgICAgIGZvciAoIDsgKytpIDwgYXJncy5sZW5ndGg7ICkge1xuICAgICAgICAgICAgICAgIG4gPSBuZXcgQmlnTnVtYmVyKCBhcmdzW2ldICk7XG5cbiAgICAgICAgICAgICAgICAvLyBJZiBhbnkgbnVtYmVyIGlzIE5hTiwgcmV0dXJuIE5hTi5cbiAgICAgICAgICAgICAgICBpZiAoICFuLnMgKSB7XG4gICAgICAgICAgICAgICAgICAgIG0gPSBuO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKCBtZXRob2QuY2FsbCggbSwgbiApICkge1xuICAgICAgICAgICAgICAgICAgICBtID0gbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBtO1xuICAgICAgICB9XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gdHJ1ZSBpZiBuIGlzIGFuIGludGVnZXIgaW4gcmFuZ2UsIG90aGVyd2lzZSB0aHJvdy5cbiAgICAgICAgICogVXNlIGZvciBhcmd1bWVudCB2YWxpZGF0aW9uIHdoZW4gRVJST1JTIGlzIHRydWUuXG4gICAgICAgICAqL1xuICAgICAgICBmdW5jdGlvbiBpbnRWYWxpZGF0b3JXaXRoRXJyb3JzKCBuLCBtaW4sIG1heCwgY2FsbGVyLCBuYW1lICkge1xuICAgICAgICAgICAgaWYgKCBuIDwgbWluIHx8IG4gPiBtYXggfHwgbiAhPSB0cnVuY2F0ZShuKSApIHtcbiAgICAgICAgICAgICAgICByYWlzZSggY2FsbGVyLCAoIG5hbWUgfHwgJ2RlY2ltYWwgcGxhY2VzJyApICtcbiAgICAgICAgICAgICAgICAgICggbiA8IG1pbiB8fCBuID4gbWF4ID8gJyBvdXQgb2YgcmFuZ2UnIDogJyBub3QgYW4gaW50ZWdlcicgKSwgbiApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogU3RyaXAgdHJhaWxpbmcgemVyb3MsIGNhbGN1bGF0ZSBiYXNlIDEwIGV4cG9uZW50IGFuZCBjaGVjayBhZ2FpbnN0IE1JTl9FWFAgYW5kIE1BWF9FWFAuXG4gICAgICAgICAqIENhbGxlZCBieSBtaW51cywgcGx1cyBhbmQgdGltZXMuXG4gICAgICAgICAqL1xuICAgICAgICBmdW5jdGlvbiBub3JtYWxpc2UoIG4sIGMsIGUgKSB7XG4gICAgICAgICAgICB2YXIgaSA9IDEsXG4gICAgICAgICAgICAgICAgaiA9IGMubGVuZ3RoO1xuXG4gICAgICAgICAgICAgLy8gUmVtb3ZlIHRyYWlsaW5nIHplcm9zLlxuICAgICAgICAgICAgZm9yICggOyAhY1stLWpdOyBjLnBvcCgpICk7XG5cbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgYmFzZSAxMCBleHBvbmVudC4gRmlyc3QgZ2V0IHRoZSBudW1iZXIgb2YgZGlnaXRzIG9mIGNbMF0uXG4gICAgICAgICAgICBmb3IgKCBqID0gY1swXTsgaiA+PSAxMDsgaiAvPSAxMCwgaSsrICk7XG5cbiAgICAgICAgICAgIC8vIE92ZXJmbG93P1xuICAgICAgICAgICAgaWYgKCAoIGUgPSBpICsgZSAqIExPR19CQVNFIC0gMSApID4gTUFYX0VYUCApIHtcblxuICAgICAgICAgICAgICAgIC8vIEluZmluaXR5LlxuICAgICAgICAgICAgICAgIG4uYyA9IG4uZSA9IG51bGw7XG5cbiAgICAgICAgICAgIC8vIFVuZGVyZmxvdz9cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIGUgPCBNSU5fRVhQICkge1xuXG4gICAgICAgICAgICAgICAgLy8gWmVyby5cbiAgICAgICAgICAgICAgICBuLmMgPSBbIG4uZSA9IDAgXTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbi5lID0gZTtcbiAgICAgICAgICAgICAgICBuLmMgPSBjO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgfVxuXG5cbiAgICAgICAgLy8gSGFuZGxlIHZhbHVlcyB0aGF0IGZhaWwgdGhlIHZhbGlkaXR5IHRlc3QgaW4gQmlnTnVtYmVyLlxuICAgICAgICBwYXJzZU51bWVyaWMgPSAoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGJhc2VQcmVmaXggPSAvXigtPykwKFt4Ym9dKS9pLFxuICAgICAgICAgICAgICAgIGRvdEFmdGVyID0gL14oW14uXSspXFwuJC8sXG4gICAgICAgICAgICAgICAgZG90QmVmb3JlID0gL15cXC4oW14uXSspJC8sXG4gICAgICAgICAgICAgICAgaXNJbmZpbml0eU9yTmFOID0gL14tPyhJbmZpbml0eXxOYU4pJC8sXG4gICAgICAgICAgICAgICAgd2hpdGVzcGFjZU9yUGx1cyA9IC9eXFxzKlxcK3xeXFxzK3xcXHMrJC9nO1xuXG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCB4LCBzdHIsIG51bSwgYiApIHtcbiAgICAgICAgICAgICAgICB2YXIgYmFzZSxcbiAgICAgICAgICAgICAgICAgICAgcyA9IG51bSA/IHN0ciA6IHN0ci5yZXBsYWNlKCB3aGl0ZXNwYWNlT3JQbHVzLCAnJyApO1xuXG4gICAgICAgICAgICAgICAgLy8gTm8gZXhjZXB0aW9uIG9uIMKxSW5maW5pdHkgb3IgTmFOLlxuICAgICAgICAgICAgICAgIGlmICggaXNJbmZpbml0eU9yTmFOLnRlc3QocykgKSB7XG4gICAgICAgICAgICAgICAgICAgIHgucyA9IGlzTmFOKHMpID8gbnVsbCA6IHMgPCAwID8gLTEgOiAxO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICggIW51bSApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYmFzZVByZWZpeCA9IC9eKC0/KTAoW3hib10pKD89XFx3W1xcdy5dKiQpL2lcbiAgICAgICAgICAgICAgICAgICAgICAgIHMgPSBzLnJlcGxhY2UoIGJhc2VQcmVmaXgsIGZ1bmN0aW9uICggbSwgcDEsIHAyICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2UgPSAoIHAyID0gcDIudG9Mb3dlckNhc2UoKSApID09ICd4JyA/IDE2IDogcDIgPT0gJ2InID8gMiA6IDg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICFiIHx8IGIgPT0gYmFzZSA/IHAxIDogbTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoYikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJhc2UgPSBiO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gRS5nLiAnMS4nIHRvICcxJywgJy4xJyB0byAnMC4xJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHMgPSBzLnJlcGxhY2UoIGRvdEFmdGVyLCAnJDEnICkucmVwbGFjZSggZG90QmVmb3JlLCAnMC4kMScgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCBzdHIgIT0gcyApIHJldHVybiBuZXcgQmlnTnVtYmVyKCBzLCBiYXNlICk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyAnbmV3IEJpZ051bWJlcigpIG5vdCBhIG51bWJlcjoge259J1xuICAgICAgICAgICAgICAgICAgICAvLyAnbmV3IEJpZ051bWJlcigpIG5vdCBhIGJhc2Uge2J9IG51bWJlcjoge259J1xuICAgICAgICAgICAgICAgICAgICBpZiAoRVJST1JTKSByYWlzZSggaWQsICdub3QgYScgKyAoIGIgPyAnIGJhc2UgJyArIGIgOiAnJyApICsgJyBudW1iZXInLCBzdHIgKTtcbiAgICAgICAgICAgICAgICAgICAgeC5zID0gbnVsbDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB4LmMgPSB4LmUgPSBudWxsO1xuICAgICAgICAgICAgICAgIGlkID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkoKTtcblxuXG4gICAgICAgIC8vIFRocm93IGEgQmlnTnVtYmVyIEVycm9yLlxuICAgICAgICBmdW5jdGlvbiByYWlzZSggY2FsbGVyLCBtc2csIHZhbCApIHtcbiAgICAgICAgICAgIHZhciBlcnJvciA9IG5ldyBFcnJvciggW1xuICAgICAgICAgICAgICAgICduZXcgQmlnTnVtYmVyJywgICAgIC8vIDBcbiAgICAgICAgICAgICAgICAnY21wJywgICAgICAgICAgICAgICAvLyAxXG4gICAgICAgICAgICAgICAgJ2NvbmZpZycsICAgICAgICAgICAgLy8gMlxuICAgICAgICAgICAgICAgICdkaXYnLCAgICAgICAgICAgICAgIC8vIDNcbiAgICAgICAgICAgICAgICAnZGl2VG9JbnQnLCAgICAgICAgICAvLyA0XG4gICAgICAgICAgICAgICAgJ2VxJywgICAgICAgICAgICAgICAgLy8gNVxuICAgICAgICAgICAgICAgICdndCcsICAgICAgICAgICAgICAgIC8vIDZcbiAgICAgICAgICAgICAgICAnZ3RlJywgICAgICAgICAgICAgICAvLyA3XG4gICAgICAgICAgICAgICAgJ2x0JywgICAgICAgICAgICAgICAgLy8gOFxuICAgICAgICAgICAgICAgICdsdGUnLCAgICAgICAgICAgICAgIC8vIDlcbiAgICAgICAgICAgICAgICAnbWludXMnLCAgICAgICAgICAgICAvLyAxMFxuICAgICAgICAgICAgICAgICdtb2QnLCAgICAgICAgICAgICAgIC8vIDExXG4gICAgICAgICAgICAgICAgJ3BsdXMnLCAgICAgICAgICAgICAgLy8gMTJcbiAgICAgICAgICAgICAgICAncHJlY2lzaW9uJywgICAgICAgICAvLyAxM1xuICAgICAgICAgICAgICAgICdyYW5kb20nLCAgICAgICAgICAgIC8vIDE0XG4gICAgICAgICAgICAgICAgJ3JvdW5kJywgICAgICAgICAgICAgLy8gMTVcbiAgICAgICAgICAgICAgICAnc2hpZnQnLCAgICAgICAgICAgICAvLyAxNlxuICAgICAgICAgICAgICAgICd0aW1lcycsICAgICAgICAgICAgIC8vIDE3XG4gICAgICAgICAgICAgICAgJ3RvRGlnaXRzJywgICAgICAgICAgLy8gMThcbiAgICAgICAgICAgICAgICAndG9FeHBvbmVudGlhbCcsICAgICAvLyAxOVxuICAgICAgICAgICAgICAgICd0b0ZpeGVkJywgICAgICAgICAgIC8vIDIwXG4gICAgICAgICAgICAgICAgJ3RvRm9ybWF0JywgICAgICAgICAgLy8gMjFcbiAgICAgICAgICAgICAgICAndG9GcmFjdGlvbicsICAgICAgICAvLyAyMlxuICAgICAgICAgICAgICAgICdwb3cnLCAgICAgICAgICAgICAgIC8vIDIzXG4gICAgICAgICAgICAgICAgJ3RvUHJlY2lzaW9uJywgICAgICAgLy8gMjRcbiAgICAgICAgICAgICAgICAndG9TdHJpbmcnLCAgICAgICAgICAvLyAyNVxuICAgICAgICAgICAgICAgICdCaWdOdW1iZXInICAgICAgICAgIC8vIDI2XG4gICAgICAgICAgICBdW2NhbGxlcl0gKyAnKCkgJyArIG1zZyArICc6ICcgKyB2YWwgKTtcblxuICAgICAgICAgICAgZXJyb3IubmFtZSA9ICdCaWdOdW1iZXIgRXJyb3InO1xuICAgICAgICAgICAgaWQgPSAwO1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJvdW5kIHggdG8gc2Qgc2lnbmlmaWNhbnQgZGlnaXRzIHVzaW5nIHJvdW5kaW5nIG1vZGUgcm0uIENoZWNrIGZvciBvdmVyL3VuZGVyLWZsb3cuXG4gICAgICAgICAqIElmIHIgaXMgdHJ1dGh5LCBpdCBpcyBrbm93biB0aGF0IHRoZXJlIGFyZSBtb3JlIGRpZ2l0cyBhZnRlciB0aGUgcm91bmRpbmcgZGlnaXQuXG4gICAgICAgICAqL1xuICAgICAgICBmdW5jdGlvbiByb3VuZCggeCwgc2QsIHJtLCByICkge1xuICAgICAgICAgICAgdmFyIGQsIGksIGosIGssIG4sIG5pLCByZCxcbiAgICAgICAgICAgICAgICB4YyA9IHguYyxcbiAgICAgICAgICAgICAgICBwb3dzMTAgPSBQT1dTX1RFTjtcblxuICAgICAgICAgICAgLy8gaWYgeCBpcyBub3QgSW5maW5pdHkgb3IgTmFOLi4uXG4gICAgICAgICAgICBpZiAoeGMpIHtcblxuICAgICAgICAgICAgICAgIC8vIHJkIGlzIHRoZSByb3VuZGluZyBkaWdpdCwgaS5lLiB0aGUgZGlnaXQgYWZ0ZXIgdGhlIGRpZ2l0IHRoYXQgbWF5IGJlIHJvdW5kZWQgdXAuXG4gICAgICAgICAgICAgICAgLy8gbiBpcyBhIGJhc2UgMWUxNCBudW1iZXIsIHRoZSB2YWx1ZSBvZiB0aGUgZWxlbWVudCBvZiBhcnJheSB4LmMgY29udGFpbmluZyByZC5cbiAgICAgICAgICAgICAgICAvLyBuaSBpcyB0aGUgaW5kZXggb2YgbiB3aXRoaW4geC5jLlxuICAgICAgICAgICAgICAgIC8vIGQgaXMgdGhlIG51bWJlciBvZiBkaWdpdHMgb2Ygbi5cbiAgICAgICAgICAgICAgICAvLyBpIGlzIHRoZSBpbmRleCBvZiByZCB3aXRoaW4gbiBpbmNsdWRpbmcgbGVhZGluZyB6ZXJvcy5cbiAgICAgICAgICAgICAgICAvLyBqIGlzIHRoZSBhY3R1YWwgaW5kZXggb2YgcmQgd2l0aGluIG4gKGlmIDwgMCwgcmQgaXMgYSBsZWFkaW5nIHplcm8pLlxuICAgICAgICAgICAgICAgIG91dDoge1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEdldCB0aGUgbnVtYmVyIG9mIGRpZ2l0cyBvZiB0aGUgZmlyc3QgZWxlbWVudCBvZiB4Yy5cbiAgICAgICAgICAgICAgICAgICAgZm9yICggZCA9IDEsIGsgPSB4Y1swXTsgayA+PSAxMDsgayAvPSAxMCwgZCsrICk7XG4gICAgICAgICAgICAgICAgICAgIGkgPSBzZCAtIGQ7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhlIHJvdW5kaW5nIGRpZ2l0IGlzIGluIHRoZSBmaXJzdCBlbGVtZW50IG9mIHhjLi4uXG4gICAgICAgICAgICAgICAgICAgIGlmICggaSA8IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpICs9IExPR19CQVNFO1xuICAgICAgICAgICAgICAgICAgICAgICAgaiA9IHNkO1xuICAgICAgICAgICAgICAgICAgICAgICAgbiA9IHhjWyBuaSA9IDAgXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gR2V0IHRoZSByb3VuZGluZyBkaWdpdCBhdCBpbmRleCBqIG9mIG4uXG4gICAgICAgICAgICAgICAgICAgICAgICByZCA9IG4gLyBwb3dzMTBbIGQgLSBqIC0gMSBdICUgMTAgfCAwO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgbmkgPSBtYXRoY2VpbCggKCBpICsgMSApIC8gTE9HX0JBU0UgKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCBuaSA+PSB4Yy5sZW5ndGggKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAocikge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5lZWRlZCBieSBzcXJ0LlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKCA7IHhjLmxlbmd0aCA8PSBuaTsgeGMucHVzaCgwKSApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBuID0gcmQgPSAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkID0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaSAlPSBMT0dfQkFTRTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaiA9IGkgLSBMT0dfQkFTRSArIDE7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWsgb3V0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbiA9IGsgPSB4Y1tuaV07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIG51bWJlciBvZiBkaWdpdHMgb2Ygbi5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmb3IgKCBkID0gMTsgayA+PSAxMDsgayAvPSAxMCwgZCsrICk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIGluZGV4IG9mIHJkIHdpdGhpbiBuLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGkgJT0gTE9HX0JBU0U7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIGluZGV4IG9mIHJkIHdpdGhpbiBuLCBhZGp1c3RlZCBmb3IgbGVhZGluZyB6ZXJvcy5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGUgbnVtYmVyIG9mIGxlYWRpbmcgemVyb3Mgb2YgbiBpcyBnaXZlbiBieSBMT0dfQkFTRSAtIGQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaiA9IGkgLSBMT0dfQkFTRSArIGQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBHZXQgdGhlIHJvdW5kaW5nIGRpZ2l0IGF0IGluZGV4IGogb2Ygbi5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZCA9IGogPCAwID8gMCA6IG4gLyBwb3dzMTBbIGQgLSBqIC0gMSBdICUgMTAgfCAwO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgciA9IHIgfHwgc2QgPCAwIHx8XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQXJlIHRoZXJlIGFueSBub24temVybyBkaWdpdHMgYWZ0ZXIgdGhlIHJvdW5kaW5nIGRpZ2l0P1xuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgZXhwcmVzc2lvbiAgbiAlIHBvd3MxMFsgZCAtIGogLSAxIF0gIHJldHVybnMgYWxsIGRpZ2l0cyBvZiBuIHRvIHRoZSByaWdodFxuICAgICAgICAgICAgICAgICAgICAvLyBvZiB0aGUgZGlnaXQgYXQgaiwgZS5nLiBpZiBuIGlzIDkwODcxNCBhbmQgaiBpcyAyLCB0aGUgZXhwcmVzc2lvbiBnaXZlcyA3MTQuXG4gICAgICAgICAgICAgICAgICAgICAgeGNbbmkgKyAxXSAhPSBudWxsIHx8ICggaiA8IDAgPyBuIDogbiAlIHBvd3MxMFsgZCAtIGogLSAxIF0gKTtcblxuICAgICAgICAgICAgICAgICAgICByID0gcm0gPCA0XG4gICAgICAgICAgICAgICAgICAgICAgPyAoIHJkIHx8IHIgKSAmJiAoIHJtID09IDAgfHwgcm0gPT0gKCB4LnMgPCAwID8gMyA6IDIgKSApXG4gICAgICAgICAgICAgICAgICAgICAgOiByZCA+IDUgfHwgcmQgPT0gNSAmJiAoIHJtID09IDQgfHwgciB8fCBybSA9PSA2ICYmXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIHdoZXRoZXIgdGhlIGRpZ2l0IHRvIHRoZSBsZWZ0IG9mIHRoZSByb3VuZGluZyBkaWdpdCBpcyBvZGQuXG4gICAgICAgICAgICAgICAgICAgICAgICAoICggaSA+IDAgPyBqID4gMCA/IG4gLyBwb3dzMTBbIGQgLSBqIF0gOiAwIDogeGNbbmkgLSAxXSApICUgMTAgKSAmIDEgfHxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgcm0gPT0gKCB4LnMgPCAwID8gOCA6IDcgKSApO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICggc2QgPCAxIHx8ICF4Y1swXSApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHhjLmxlbmd0aCA9IDA7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBDb252ZXJ0IHNkIHRvIGRlY2ltYWwgcGxhY2VzLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNkIC09IHguZSArIDE7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAxLCAwLjEsIDAuMDEsIDAuMDAxLCAwLjAwMDEgZXRjLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHhjWzBdID0gcG93czEwWyBzZCAlIExPR19CQVNFIF07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeC5lID0gLXNkIHx8IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gWmVyby5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4Y1swXSA9IHguZSA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGV4Y2VzcyBkaWdpdHMuXG4gICAgICAgICAgICAgICAgICAgIGlmICggaSA9PSAwICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgeGMubGVuZ3RoID0gbmk7XG4gICAgICAgICAgICAgICAgICAgICAgICBrID0gMTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG5pLS07XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4Yy5sZW5ndGggPSBuaSArIDE7XG4gICAgICAgICAgICAgICAgICAgICAgICBrID0gcG93czEwWyBMT0dfQkFTRSAtIGkgXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRS5nLiA1NjcwMCBiZWNvbWVzIDU2MDAwIGlmIDcgaXMgdGhlIHJvdW5kaW5nIGRpZ2l0LlxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gaiA+IDAgbWVhbnMgaSA+IG51bWJlciBvZiBsZWFkaW5nIHplcm9zIG9mIG4uXG4gICAgICAgICAgICAgICAgICAgICAgICB4Y1tuaV0gPSBqID4gMCA/IG1hdGhmbG9vciggbiAvIHBvd3MxMFsgZCAtIGogXSAlIHBvd3MxMFtqXSApICogayA6IDA7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBSb3VuZCB1cD9cbiAgICAgICAgICAgICAgICAgICAgaWYgKHIpIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yICggOyA7ICkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgdGhlIGRpZ2l0IHRvIGJlIHJvdW5kZWQgdXAgaXMgaW4gdGhlIGZpcnN0IGVsZW1lbnQgb2YgeGMuLi5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIG5pID09IDAgKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gaSB3aWxsIGJlIHRoZSBsZW5ndGggb2YgeGNbMF0gYmVmb3JlIGsgaXMgYWRkZWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoIGkgPSAxLCBqID0geGNbMF07IGogPj0gMTA7IGogLz0gMTAsIGkrKyApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBqID0geGNbMF0gKz0gaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yICggayA9IDE7IGogPj0gMTA7IGogLz0gMTAsIGsrKyApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIGkgIT0gayB0aGUgbGVuZ3RoIGhhcyBpbmNyZWFzZWQuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICggaSAhPSBrICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgeC5lKys7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoIHhjWzBdID09IEJBU0UgKSB4Y1swXSA9IDE7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB4Y1tuaV0gKz0gaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCB4Y1tuaV0gIT0gQkFTRSApIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB4Y1tuaS0tXSA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGsgPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlbW92ZSB0cmFpbGluZyB6ZXJvcy5cbiAgICAgICAgICAgICAgICAgICAgZm9yICggaSA9IHhjLmxlbmd0aDsgeGNbLS1pXSA9PT0gMDsgeGMucG9wKCkgKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBPdmVyZmxvdz8gSW5maW5pdHkuXG4gICAgICAgICAgICAgICAgaWYgKCB4LmUgPiBNQVhfRVhQICkge1xuICAgICAgICAgICAgICAgICAgICB4LmMgPSB4LmUgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgLy8gVW5kZXJmbG93PyBaZXJvLlxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIHguZSA8IE1JTl9FWFAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHguYyA9IFsgeC5lID0gMCBdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHg7XG4gICAgICAgIH1cblxuXG4gICAgICAgIC8vIFBST1RPVFlQRS9JTlNUQU5DRSBNRVRIT0RTXG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSBhYnNvbHV0ZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlci5cbiAgICAgICAgICovXG4gICAgICAgIFAuYWJzb2x1dGVWYWx1ZSA9IFAuYWJzID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHggPSBuZXcgQmlnTnVtYmVyKHRoaXMpO1xuICAgICAgICAgICAgaWYgKCB4LnMgPCAwICkgeC5zID0gMTtcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgcm91bmRlZCB0byBhIHdob2xlXG4gICAgICAgICAqIG51bWJlciBpbiB0aGUgZGlyZWN0aW9uIG9mIEluZmluaXR5LlxuICAgICAgICAgKi9cbiAgICAgICAgUC5jZWlsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHJvdW5kKCBuZXcgQmlnTnVtYmVyKHRoaXMpLCB0aGlzLmUgKyAxLCAyICk7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm5cbiAgICAgICAgICogMSBpZiB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgaXMgZ3JlYXRlciB0aGFuIHRoZSB2YWx1ZSBvZiBCaWdOdW1iZXIoeSwgYiksXG4gICAgICAgICAqIC0xIGlmIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBpcyBsZXNzIHRoYW4gdGhlIHZhbHVlIG9mIEJpZ051bWJlcih5LCBiKSxcbiAgICAgICAgICogMCBpZiB0aGV5IGhhdmUgdGhlIHNhbWUgdmFsdWUsXG4gICAgICAgICAqIG9yIG51bGwgaWYgdGhlIHZhbHVlIG9mIGVpdGhlciBpcyBOYU4uXG4gICAgICAgICAqL1xuICAgICAgICBQLmNvbXBhcmVkVG8gPSBQLmNtcCA9IGZ1bmN0aW9uICggeSwgYiApIHtcbiAgICAgICAgICAgIGlkID0gMTtcbiAgICAgICAgICAgIHJldHVybiBjb21wYXJlKCB0aGlzLCBuZXcgQmlnTnVtYmVyKCB5LCBiICkgKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiB0aGUgbnVtYmVyIG9mIGRlY2ltYWwgcGxhY2VzIG9mIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciwgb3IgbnVsbCBpZiB0aGUgdmFsdWVcbiAgICAgICAgICogb2YgdGhpcyBCaWdOdW1iZXIgaXMgwrFJbmZpbml0eSBvciBOYU4uXG4gICAgICAgICAqL1xuICAgICAgICBQLmRlY2ltYWxQbGFjZXMgPSBQLmRwID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG4sIHYsXG4gICAgICAgICAgICAgICAgYyA9IHRoaXMuYztcblxuICAgICAgICAgICAgaWYgKCAhYyApIHJldHVybiBudWxsO1xuICAgICAgICAgICAgbiA9ICggKCB2ID0gYy5sZW5ndGggLSAxICkgLSBiaXRGbG9vciggdGhpcy5lIC8gTE9HX0JBU0UgKSApICogTE9HX0JBU0U7XG5cbiAgICAgICAgICAgIC8vIFN1YnRyYWN0IHRoZSBudW1iZXIgb2YgdHJhaWxpbmcgemVyb3Mgb2YgdGhlIGxhc3QgbnVtYmVyLlxuICAgICAgICAgICAgaWYgKCB2ID0gY1t2XSApIGZvciAoIDsgdiAlIDEwID09IDA7IHYgLz0gMTAsIG4tLSApO1xuICAgICAgICAgICAgaWYgKCBuIDwgMCApIG4gPSAwO1xuXG4gICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqICBuIC8gMCA9IElcbiAgICAgICAgICogIG4gLyBOID0gTlxuICAgICAgICAgKiAgbiAvIEkgPSAwXG4gICAgICAgICAqICAwIC8gbiA9IDBcbiAgICAgICAgICogIDAgLyAwID0gTlxuICAgICAgICAgKiAgMCAvIE4gPSBOXG4gICAgICAgICAqICAwIC8gSSA9IDBcbiAgICAgICAgICogIE4gLyBuID0gTlxuICAgICAgICAgKiAgTiAvIDAgPSBOXG4gICAgICAgICAqICBOIC8gTiA9IE5cbiAgICAgICAgICogIE4gLyBJID0gTlxuICAgICAgICAgKiAgSSAvIG4gPSBJXG4gICAgICAgICAqICBJIC8gMCA9IElcbiAgICAgICAgICogIEkgLyBOID0gTlxuICAgICAgICAgKiAgSSAvIEkgPSBOXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybiBhIG5ldyBCaWdOdW1iZXIgd2hvc2UgdmFsdWUgaXMgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIGRpdmlkZWQgYnkgdGhlIHZhbHVlIG9mXG4gICAgICAgICAqIEJpZ051bWJlcih5LCBiKSwgcm91bmRlZCBhY2NvcmRpbmcgdG8gREVDSU1BTF9QTEFDRVMgYW5kIFJPVU5ESU5HX01PREUuXG4gICAgICAgICAqL1xuICAgICAgICBQLmRpdmlkZWRCeSA9IFAuZGl2ID0gZnVuY3Rpb24gKCB5LCBiICkge1xuICAgICAgICAgICAgaWQgPSAzO1xuICAgICAgICAgICAgcmV0dXJuIGRpdiggdGhpcywgbmV3IEJpZ051bWJlciggeSwgYiApLCBERUNJTUFMX1BMQUNFUywgUk9VTkRJTkdfTU9ERSApO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgaW50ZWdlciBwYXJ0IG9mIGRpdmlkaW5nIHRoZSB2YWx1ZSBvZiB0aGlzXG4gICAgICAgICAqIEJpZ051bWJlciBieSB0aGUgdmFsdWUgb2YgQmlnTnVtYmVyKHksIGIpLlxuICAgICAgICAgKi9cbiAgICAgICAgUC5kaXZpZGVkVG9JbnRlZ2VyQnkgPSBQLmRpdlRvSW50ID0gZnVuY3Rpb24gKCB5LCBiICkge1xuICAgICAgICAgICAgaWQgPSA0O1xuICAgICAgICAgICAgcmV0dXJuIGRpdiggdGhpcywgbmV3IEJpZ051bWJlciggeSwgYiApLCAwLCAxICk7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gdHJ1ZSBpZiB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgaXMgZXF1YWwgdG8gdGhlIHZhbHVlIG9mIEJpZ051bWJlcih5LCBiKSxcbiAgICAgICAgICogb3RoZXJ3aXNlIHJldHVybnMgZmFsc2UuXG4gICAgICAgICAqL1xuICAgICAgICBQLmVxdWFscyA9IFAuZXEgPSBmdW5jdGlvbiAoIHksIGIgKSB7XG4gICAgICAgICAgICBpZCA9IDU7XG4gICAgICAgICAgICByZXR1cm4gY29tcGFyZSggdGhpcywgbmV3IEJpZ051bWJlciggeSwgYiApICkgPT09IDA7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciByb3VuZGVkIHRvIGEgd2hvbGVcbiAgICAgICAgICogbnVtYmVyIGluIHRoZSBkaXJlY3Rpb24gb2YgLUluZmluaXR5LlxuICAgICAgICAgKi9cbiAgICAgICAgUC5mbG9vciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiByb3VuZCggbmV3IEJpZ051bWJlcih0aGlzKSwgdGhpcy5lICsgMSwgMyApO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIHRydWUgaWYgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIGlzIGdyZWF0ZXIgdGhhbiB0aGUgdmFsdWUgb2YgQmlnTnVtYmVyKHksIGIpLFxuICAgICAgICAgKiBvdGhlcndpc2UgcmV0dXJucyBmYWxzZS5cbiAgICAgICAgICovXG4gICAgICAgIFAuZ3JlYXRlclRoYW4gPSBQLmd0ID0gZnVuY3Rpb24gKCB5LCBiICkge1xuICAgICAgICAgICAgaWQgPSA2O1xuICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmUoIHRoaXMsIG5ldyBCaWdOdW1iZXIoIHksIGIgKSApID4gMDtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiB0cnVlIGlmIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBpcyBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gdGhlIHZhbHVlIG9mXG4gICAgICAgICAqIEJpZ051bWJlcih5LCBiKSwgb3RoZXJ3aXNlIHJldHVybnMgZmFsc2UuXG4gICAgICAgICAqL1xuICAgICAgICBQLmdyZWF0ZXJUaGFuT3JFcXVhbFRvID0gUC5ndGUgPSBmdW5jdGlvbiAoIHksIGIgKSB7XG4gICAgICAgICAgICBpZCA9IDc7XG4gICAgICAgICAgICByZXR1cm4gKCBiID0gY29tcGFyZSggdGhpcywgbmV3IEJpZ051bWJlciggeSwgYiApICkgKSA9PT0gMSB8fCBiID09PSAwO1xuXG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gdHJ1ZSBpZiB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgaXMgYSBmaW5pdGUgbnVtYmVyLCBvdGhlcndpc2UgcmV0dXJucyBmYWxzZS5cbiAgICAgICAgICovXG4gICAgICAgIFAuaXNGaW5pdGUgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gISF0aGlzLmM7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gdHJ1ZSBpZiB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgaXMgYW4gaW50ZWdlciwgb3RoZXJ3aXNlIHJldHVybiBmYWxzZS5cbiAgICAgICAgICovXG4gICAgICAgIFAuaXNJbnRlZ2VyID0gUC5pc0ludCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiAhIXRoaXMuYyAmJiBiaXRGbG9vciggdGhpcy5lIC8gTE9HX0JBU0UgKSA+IHRoaXMuYy5sZW5ndGggLSAyO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIHRydWUgaWYgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIGlzIE5hTiwgb3RoZXJ3aXNlIHJldHVybnMgZmFsc2UuXG4gICAgICAgICAqL1xuICAgICAgICBQLmlzTmFOID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICF0aGlzLnM7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gdHJ1ZSBpZiB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgaXMgbmVnYXRpdmUsIG90aGVyd2lzZSByZXR1cm5zIGZhbHNlLlxuICAgICAgICAgKi9cbiAgICAgICAgUC5pc05lZ2F0aXZlID0gUC5pc05lZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnMgPCAwO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIHRydWUgaWYgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIGlzIDAgb3IgLTAsIG90aGVyd2lzZSByZXR1cm5zIGZhbHNlLlxuICAgICAgICAgKi9cbiAgICAgICAgUC5pc1plcm8gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gISF0aGlzLmMgJiYgdGhpcy5jWzBdID09IDA7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gdHJ1ZSBpZiB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgaXMgbGVzcyB0aGFuIHRoZSB2YWx1ZSBvZiBCaWdOdW1iZXIoeSwgYiksXG4gICAgICAgICAqIG90aGVyd2lzZSByZXR1cm5zIGZhbHNlLlxuICAgICAgICAgKi9cbiAgICAgICAgUC5sZXNzVGhhbiA9IFAubHQgPSBmdW5jdGlvbiAoIHksIGIgKSB7XG4gICAgICAgICAgICBpZCA9IDg7XG4gICAgICAgICAgICByZXR1cm4gY29tcGFyZSggdGhpcywgbmV3IEJpZ051bWJlciggeSwgYiApICkgPCAwO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIHRydWUgaWYgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byB0aGUgdmFsdWUgb2ZcbiAgICAgICAgICogQmlnTnVtYmVyKHksIGIpLCBvdGhlcndpc2UgcmV0dXJucyBmYWxzZS5cbiAgICAgICAgICovXG4gICAgICAgIFAubGVzc1RoYW5PckVxdWFsVG8gPSBQLmx0ZSA9IGZ1bmN0aW9uICggeSwgYiApIHtcbiAgICAgICAgICAgIGlkID0gOTtcbiAgICAgICAgICAgIHJldHVybiAoIGIgPSBjb21wYXJlKCB0aGlzLCBuZXcgQmlnTnVtYmVyKCB5LCBiICkgKSApID09PSAtMSB8fCBiID09PSAwO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogIG4gLSAwID0gblxuICAgICAgICAgKiAgbiAtIE4gPSBOXG4gICAgICAgICAqICBuIC0gSSA9IC1JXG4gICAgICAgICAqICAwIC0gbiA9IC1uXG4gICAgICAgICAqICAwIC0gMCA9IDBcbiAgICAgICAgICogIDAgLSBOID0gTlxuICAgICAgICAgKiAgMCAtIEkgPSAtSVxuICAgICAgICAgKiAgTiAtIG4gPSBOXG4gICAgICAgICAqICBOIC0gMCA9IE5cbiAgICAgICAgICogIE4gLSBOID0gTlxuICAgICAgICAgKiAgTiAtIEkgPSBOXG4gICAgICAgICAqICBJIC0gbiA9IElcbiAgICAgICAgICogIEkgLSAwID0gSVxuICAgICAgICAgKiAgSSAtIE4gPSBOXG4gICAgICAgICAqICBJIC0gSSA9IE5cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgbWludXMgdGhlIHZhbHVlIG9mXG4gICAgICAgICAqIEJpZ051bWJlcih5LCBiKS5cbiAgICAgICAgICovXG4gICAgICAgIFAubWludXMgPSBQLnN1YiA9IGZ1bmN0aW9uICggeSwgYiApIHtcbiAgICAgICAgICAgIHZhciBpLCBqLCB0LCB4TFR5LFxuICAgICAgICAgICAgICAgIHggPSB0aGlzLFxuICAgICAgICAgICAgICAgIGEgPSB4LnM7XG5cbiAgICAgICAgICAgIGlkID0gMTA7XG4gICAgICAgICAgICB5ID0gbmV3IEJpZ051bWJlciggeSwgYiApO1xuICAgICAgICAgICAgYiA9IHkucztcblxuICAgICAgICAgICAgLy8gRWl0aGVyIE5hTj9cbiAgICAgICAgICAgIGlmICggIWEgfHwgIWIgKSByZXR1cm4gbmV3IEJpZ051bWJlcihOYU4pO1xuXG4gICAgICAgICAgICAvLyBTaWducyBkaWZmZXI/XG4gICAgICAgICAgICBpZiAoIGEgIT0gYiApIHtcbiAgICAgICAgICAgICAgICB5LnMgPSAtYjtcbiAgICAgICAgICAgICAgICByZXR1cm4geC5wbHVzKHkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgeGUgPSB4LmUgLyBMT0dfQkFTRSxcbiAgICAgICAgICAgICAgICB5ZSA9IHkuZSAvIExPR19CQVNFLFxuICAgICAgICAgICAgICAgIHhjID0geC5jLFxuICAgICAgICAgICAgICAgIHljID0geS5jO1xuXG4gICAgICAgICAgICBpZiAoICF4ZSB8fCAheWUgKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBFaXRoZXIgSW5maW5pdHk/XG4gICAgICAgICAgICAgICAgaWYgKCAheGMgfHwgIXljICkgcmV0dXJuIHhjID8gKCB5LnMgPSAtYiwgeSApIDogbmV3IEJpZ051bWJlciggeWMgPyB4IDogTmFOICk7XG5cbiAgICAgICAgICAgICAgICAvLyBFaXRoZXIgemVybz9cbiAgICAgICAgICAgICAgICBpZiAoICF4Y1swXSB8fCAheWNbMF0gKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmV0dXJuIHkgaWYgeSBpcyBub24temVybywgeCBpZiB4IGlzIG5vbi16ZXJvLCBvciB6ZXJvIGlmIGJvdGggYXJlIHplcm8uXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB5Y1swXSA/ICggeS5zID0gLWIsIHkgKSA6IG5ldyBCaWdOdW1iZXIoIHhjWzBdID8geCA6XG5cbiAgICAgICAgICAgICAgICAgICAgICAvLyBJRUVFIDc1NCAoMjAwOCkgNi4zOiBuIC0gbiA9IC0wIHdoZW4gcm91bmRpbmcgdG8gLUluZmluaXR5XG4gICAgICAgICAgICAgICAgICAgICAgUk9VTkRJTkdfTU9ERSA9PSAzID8gLTAgOiAwICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB4ZSA9IGJpdEZsb29yKHhlKTtcbiAgICAgICAgICAgIHllID0gYml0Rmxvb3IoeWUpO1xuICAgICAgICAgICAgeGMgPSB4Yy5zbGljZSgpO1xuXG4gICAgICAgICAgICAvLyBEZXRlcm1pbmUgd2hpY2ggaXMgdGhlIGJpZ2dlciBudW1iZXIuXG4gICAgICAgICAgICBpZiAoIGEgPSB4ZSAtIHllICkge1xuXG4gICAgICAgICAgICAgICAgaWYgKCB4TFR5ID0gYSA8IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgIGEgPSAtYTtcbiAgICAgICAgICAgICAgICAgICAgdCA9IHhjO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHllID0geGU7XG4gICAgICAgICAgICAgICAgICAgIHQgPSB5YztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0LnJldmVyc2UoKTtcblxuICAgICAgICAgICAgICAgIC8vIFByZXBlbmQgemVyb3MgdG8gZXF1YWxpc2UgZXhwb25lbnRzLlxuICAgICAgICAgICAgICAgIGZvciAoIGIgPSBhOyBiLS07IHQucHVzaCgwKSApO1xuICAgICAgICAgICAgICAgIHQucmV2ZXJzZSgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgIC8vIEV4cG9uZW50cyBlcXVhbC4gQ2hlY2sgZGlnaXQgYnkgZGlnaXQuXG4gICAgICAgICAgICAgICAgaiA9ICggeExUeSA9ICggYSA9IHhjLmxlbmd0aCApIDwgKCBiID0geWMubGVuZ3RoICkgKSA/IGEgOiBiO1xuXG4gICAgICAgICAgICAgICAgZm9yICggYSA9IGIgPSAwOyBiIDwgajsgYisrICkge1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICggeGNbYl0gIT0geWNbYl0gKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB4TFR5ID0geGNbYl0gPCB5Y1tiXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyB4IDwgeT8gUG9pbnQgeGMgdG8gdGhlIGFycmF5IG9mIHRoZSBiaWdnZXIgbnVtYmVyLlxuICAgICAgICAgICAgaWYgKHhMVHkpIHQgPSB4YywgeGMgPSB5YywgeWMgPSB0LCB5LnMgPSAteS5zO1xuXG4gICAgICAgICAgICBiID0gKCBqID0geWMubGVuZ3RoICkgLSAoIGkgPSB4Yy5sZW5ndGggKTtcblxuICAgICAgICAgICAgLy8gQXBwZW5kIHplcm9zIHRvIHhjIGlmIHNob3J0ZXIuXG4gICAgICAgICAgICAvLyBObyBuZWVkIHRvIGFkZCB6ZXJvcyB0byB5YyBpZiBzaG9ydGVyIGFzIHN1YnRyYWN0IG9ubHkgbmVlZHMgdG8gc3RhcnQgYXQgeWMubGVuZ3RoLlxuICAgICAgICAgICAgaWYgKCBiID4gMCApIGZvciAoIDsgYi0tOyB4Y1tpKytdID0gMCApO1xuICAgICAgICAgICAgYiA9IEJBU0UgLSAxO1xuXG4gICAgICAgICAgICAvLyBTdWJ0cmFjdCB5YyBmcm9tIHhjLlxuICAgICAgICAgICAgZm9yICggOyBqID4gYTsgKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoIHhjWy0tal0gPCB5Y1tqXSApIHtcbiAgICAgICAgICAgICAgICAgICAgZm9yICggaSA9IGo7IGkgJiYgIXhjWy0taV07IHhjW2ldID0gYiApO1xuICAgICAgICAgICAgICAgICAgICAtLXhjW2ldO1xuICAgICAgICAgICAgICAgICAgICB4Y1tqXSArPSBCQVNFO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHhjW2pdIC09IHljW2pdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZW1vdmUgbGVhZGluZyB6ZXJvcyBhbmQgYWRqdXN0IGV4cG9uZW50IGFjY29yZGluZ2x5LlxuICAgICAgICAgICAgZm9yICggOyB4Y1swXSA9PSAwOyB4Yy5zaGlmdCgpLCAtLXllICk7XG5cbiAgICAgICAgICAgIC8vIFplcm8/XG4gICAgICAgICAgICBpZiAoICF4Y1swXSApIHtcblxuICAgICAgICAgICAgICAgIC8vIEZvbGxvd2luZyBJRUVFIDc1NCAoMjAwOCkgNi4zLFxuICAgICAgICAgICAgICAgIC8vIG4gLSBuID0gKzAgIGJ1dCAgbiAtIG4gPSAtMCAgd2hlbiByb3VuZGluZyB0b3dhcmRzIC1JbmZpbml0eS5cbiAgICAgICAgICAgICAgICB5LnMgPSBST1VORElOR19NT0RFID09IDMgPyAtMSA6IDE7XG4gICAgICAgICAgICAgICAgeS5jID0gWyB5LmUgPSAwIF07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIE5vIG5lZWQgdG8gY2hlY2sgZm9yIEluZmluaXR5IGFzICt4IC0gK3kgIT0gSW5maW5pdHkgJiYgLXggLSAteSAhPSBJbmZpbml0eVxuICAgICAgICAgICAgLy8gZm9yIGZpbml0ZSB4IGFuZCB5LlxuICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGlzZSggeSwgeGMsIHllICk7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiAgIG4gJSAwID0gIE5cbiAgICAgICAgICogICBuICUgTiA9ICBOXG4gICAgICAgICAqICAgbiAlIEkgPSAgblxuICAgICAgICAgKiAgIDAgJSBuID0gIDBcbiAgICAgICAgICogIC0wICUgbiA9IC0wXG4gICAgICAgICAqICAgMCAlIDAgPSAgTlxuICAgICAgICAgKiAgIDAgJSBOID0gIE5cbiAgICAgICAgICogICAwICUgSSA9ICAwXG4gICAgICAgICAqICAgTiAlIG4gPSAgTlxuICAgICAgICAgKiAgIE4gJSAwID0gIE5cbiAgICAgICAgICogICBOICUgTiA9ICBOXG4gICAgICAgICAqICAgTiAlIEkgPSAgTlxuICAgICAgICAgKiAgIEkgJSBuID0gIE5cbiAgICAgICAgICogICBJICUgMCA9ICBOXG4gICAgICAgICAqICAgSSAlIE4gPSAgTlxuICAgICAgICAgKiAgIEkgJSBJID0gIE5cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgbW9kdWxvIHRoZSB2YWx1ZSBvZlxuICAgICAgICAgKiBCaWdOdW1iZXIoeSwgYikuIFRoZSByZXN1bHQgZGVwZW5kcyBvbiB0aGUgdmFsdWUgb2YgTU9EVUxPX01PREUuXG4gICAgICAgICAqL1xuICAgICAgICBQLm1vZHVsbyA9IFAubW9kID0gZnVuY3Rpb24gKCB5LCBiICkge1xuICAgICAgICAgICAgdmFyIHEsIHMsXG4gICAgICAgICAgICAgICAgeCA9IHRoaXM7XG5cbiAgICAgICAgICAgIGlkID0gMTE7XG4gICAgICAgICAgICB5ID0gbmV3IEJpZ051bWJlciggeSwgYiApO1xuXG4gICAgICAgICAgICAvLyBSZXR1cm4gTmFOIGlmIHggaXMgSW5maW5pdHkgb3IgTmFOLCBvciB5IGlzIE5hTiBvciB6ZXJvLlxuICAgICAgICAgICAgaWYgKCAheC5jIHx8ICF5LnMgfHwgeS5jICYmICF5LmNbMF0gKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBCaWdOdW1iZXIoTmFOKTtcblxuICAgICAgICAgICAgLy8gUmV0dXJuIHggaWYgeSBpcyBJbmZpbml0eSBvciB4IGlzIHplcm8uXG4gICAgICAgICAgICB9IGVsc2UgaWYgKCAheS5jIHx8IHguYyAmJiAheC5jWzBdICkge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgQmlnTnVtYmVyKHgpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIE1PRFVMT19NT0RFID09IDkgKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBFdWNsaWRpYW4gZGl2aXNpb246IHEgPSBzaWduKHkpICogZmxvb3IoeCAvIGFicyh5KSlcbiAgICAgICAgICAgICAgICAvLyByID0geCAtIHF5ICAgIHdoZXJlICAwIDw9IHIgPCBhYnMoeSlcbiAgICAgICAgICAgICAgICBzID0geS5zO1xuICAgICAgICAgICAgICAgIHkucyA9IDE7XG4gICAgICAgICAgICAgICAgcSA9IGRpdiggeCwgeSwgMCwgMyApO1xuICAgICAgICAgICAgICAgIHkucyA9IHM7XG4gICAgICAgICAgICAgICAgcS5zICo9IHM7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHEgPSBkaXYoIHgsIHksIDAsIE1PRFVMT19NT0RFICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB4Lm1pbnVzKCBxLnRpbWVzKHkpICk7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBuZWdhdGVkLFxuICAgICAgICAgKiBpLmUuIG11bHRpcGxpZWQgYnkgLTEuXG4gICAgICAgICAqL1xuICAgICAgICBQLm5lZ2F0ZWQgPSBQLm5lZyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciB4ID0gbmV3IEJpZ051bWJlcih0aGlzKTtcbiAgICAgICAgICAgIHgucyA9IC14LnMgfHwgbnVsbDtcbiAgICAgICAgICAgIHJldHVybiB4O1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogIG4gKyAwID0gblxuICAgICAgICAgKiAgbiArIE4gPSBOXG4gICAgICAgICAqICBuICsgSSA9IElcbiAgICAgICAgICogIDAgKyBuID0gblxuICAgICAgICAgKiAgMCArIDAgPSAwXG4gICAgICAgICAqICAwICsgTiA9IE5cbiAgICAgICAgICogIDAgKyBJID0gSVxuICAgICAgICAgKiAgTiArIG4gPSBOXG4gICAgICAgICAqICBOICsgMCA9IE5cbiAgICAgICAgICogIE4gKyBOID0gTlxuICAgICAgICAgKiAgTiArIEkgPSBOXG4gICAgICAgICAqICBJICsgbiA9IElcbiAgICAgICAgICogIEkgKyAwID0gSVxuICAgICAgICAgKiAgSSArIE4gPSBOXG4gICAgICAgICAqICBJICsgSSA9IElcbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgcGx1cyB0aGUgdmFsdWUgb2ZcbiAgICAgICAgICogQmlnTnVtYmVyKHksIGIpLlxuICAgICAgICAgKi9cbiAgICAgICAgUC5wbHVzID0gUC5hZGQgPSBmdW5jdGlvbiAoIHksIGIgKSB7XG4gICAgICAgICAgICB2YXIgdCxcbiAgICAgICAgICAgICAgICB4ID0gdGhpcyxcbiAgICAgICAgICAgICAgICBhID0geC5zO1xuXG4gICAgICAgICAgICBpZCA9IDEyO1xuICAgICAgICAgICAgeSA9IG5ldyBCaWdOdW1iZXIoIHksIGIgKTtcbiAgICAgICAgICAgIGIgPSB5LnM7XG5cbiAgICAgICAgICAgIC8vIEVpdGhlciBOYU4/XG4gICAgICAgICAgICBpZiAoICFhIHx8ICFiICkgcmV0dXJuIG5ldyBCaWdOdW1iZXIoTmFOKTtcblxuICAgICAgICAgICAgLy8gU2lnbnMgZGlmZmVyP1xuICAgICAgICAgICAgIGlmICggYSAhPSBiICkge1xuICAgICAgICAgICAgICAgIHkucyA9IC1iO1xuICAgICAgICAgICAgICAgIHJldHVybiB4Lm1pbnVzKHkpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgeGUgPSB4LmUgLyBMT0dfQkFTRSxcbiAgICAgICAgICAgICAgICB5ZSA9IHkuZSAvIExPR19CQVNFLFxuICAgICAgICAgICAgICAgIHhjID0geC5jLFxuICAgICAgICAgICAgICAgIHljID0geS5jO1xuXG4gICAgICAgICAgICBpZiAoICF4ZSB8fCAheWUgKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBSZXR1cm4gwrFJbmZpbml0eSBpZiBlaXRoZXIgwrFJbmZpbml0eS5cbiAgICAgICAgICAgICAgICBpZiAoICF4YyB8fCAheWMgKSByZXR1cm4gbmV3IEJpZ051bWJlciggYSAvIDAgKTtcblxuICAgICAgICAgICAgICAgIC8vIEVpdGhlciB6ZXJvP1xuICAgICAgICAgICAgICAgIC8vIFJldHVybiB5IGlmIHkgaXMgbm9uLXplcm8sIHggaWYgeCBpcyBub24temVybywgb3IgemVybyBpZiBib3RoIGFyZSB6ZXJvLlxuICAgICAgICAgICAgICAgIGlmICggIXhjWzBdIHx8ICF5Y1swXSApIHJldHVybiB5Y1swXSA/IHkgOiBuZXcgQmlnTnVtYmVyKCB4Y1swXSA/IHggOiBhICogMCApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB4ZSA9IGJpdEZsb29yKHhlKTtcbiAgICAgICAgICAgIHllID0gYml0Rmxvb3IoeWUpO1xuICAgICAgICAgICAgeGMgPSB4Yy5zbGljZSgpO1xuXG4gICAgICAgICAgICAvLyBQcmVwZW5kIHplcm9zIHRvIGVxdWFsaXNlIGV4cG9uZW50cy4gRmFzdGVyIHRvIHVzZSByZXZlcnNlIHRoZW4gZG8gdW5zaGlmdHMuXG4gICAgICAgICAgICBpZiAoIGEgPSB4ZSAtIHllICkge1xuICAgICAgICAgICAgICAgIGlmICggYSA+IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHllID0geGU7XG4gICAgICAgICAgICAgICAgICAgIHQgPSB5YztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBhID0gLWE7XG4gICAgICAgICAgICAgICAgICAgIHQgPSB4YztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0LnJldmVyc2UoKTtcbiAgICAgICAgICAgICAgICBmb3IgKCA7IGEtLTsgdC5wdXNoKDApICk7XG4gICAgICAgICAgICAgICAgdC5yZXZlcnNlKCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGEgPSB4Yy5sZW5ndGg7XG4gICAgICAgICAgICBiID0geWMubGVuZ3RoO1xuXG4gICAgICAgICAgICAvLyBQb2ludCB4YyB0byB0aGUgbG9uZ2VyIGFycmF5LCBhbmQgYiB0byB0aGUgc2hvcnRlciBsZW5ndGguXG4gICAgICAgICAgICBpZiAoIGEgLSBiIDwgMCApIHQgPSB5YywgeWMgPSB4YywgeGMgPSB0LCBiID0gYTtcblxuICAgICAgICAgICAgLy8gT25seSBzdGFydCBhZGRpbmcgYXQgeWMubGVuZ3RoIC0gMSBhcyB0aGUgZnVydGhlciBkaWdpdHMgb2YgeGMgY2FuIGJlIGlnbm9yZWQuXG4gICAgICAgICAgICBmb3IgKCBhID0gMDsgYjsgKSB7XG4gICAgICAgICAgICAgICAgYSA9ICggeGNbLS1iXSA9IHhjW2JdICsgeWNbYl0gKyBhICkgLyBCQVNFIHwgMDtcbiAgICAgICAgICAgICAgICB4Y1tiXSAlPSBCQVNFO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYSkge1xuICAgICAgICAgICAgICAgIHhjLnVuc2hpZnQoYSk7XG4gICAgICAgICAgICAgICAgKyt5ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gTm8gbmVlZCB0byBjaGVjayBmb3IgemVybywgYXMgK3ggKyAreSAhPSAwICYmIC14ICsgLXkgIT0gMFxuICAgICAgICAgICAgLy8geWUgPSBNQVhfRVhQICsgMSBwb3NzaWJsZVxuICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGlzZSggeSwgeGMsIHllICk7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gdGhlIG51bWJlciBvZiBzaWduaWZpY2FudCBkaWdpdHMgb2YgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyLlxuICAgICAgICAgKlxuICAgICAgICAgKiBbel0ge2Jvb2xlYW58bnVtYmVyfSBXaGV0aGVyIHRvIGNvdW50IGludGVnZXItcGFydCB0cmFpbGluZyB6ZXJvczogdHJ1ZSwgZmFsc2UsIDEgb3IgMC5cbiAgICAgICAgICovXG4gICAgICAgIFAucHJlY2lzaW9uID0gUC5zZCA9IGZ1bmN0aW9uICh6KSB7XG4gICAgICAgICAgICB2YXIgbiwgdixcbiAgICAgICAgICAgICAgICB4ID0gdGhpcyxcbiAgICAgICAgICAgICAgICBjID0geC5jO1xuXG4gICAgICAgICAgICAvLyAncHJlY2lzaW9uKCkgYXJndW1lbnQgbm90IGEgYm9vbGVhbiBvciBiaW5hcnkgZGlnaXQ6IHt6fSdcbiAgICAgICAgICAgIGlmICggeiAhPSBudWxsICYmIHogIT09ICEheiAmJiB6ICE9PSAxICYmIHogIT09IDAgKSB7XG4gICAgICAgICAgICAgICAgaWYgKEVSUk9SUykgcmFpc2UoIDEzLCAnYXJndW1lbnQnICsgbm90Qm9vbCwgeiApO1xuICAgICAgICAgICAgICAgIGlmICggeiAhPSAhIXogKSB6ID0gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCAhYyApIHJldHVybiBudWxsO1xuICAgICAgICAgICAgdiA9IGMubGVuZ3RoIC0gMTtcbiAgICAgICAgICAgIG4gPSB2ICogTE9HX0JBU0UgKyAxO1xuXG4gICAgICAgICAgICBpZiAoIHYgPSBjW3ZdICkge1xuXG4gICAgICAgICAgICAgICAgLy8gU3VidHJhY3QgdGhlIG51bWJlciBvZiB0cmFpbGluZyB6ZXJvcyBvZiB0aGUgbGFzdCBlbGVtZW50LlxuICAgICAgICAgICAgICAgIGZvciAoIDsgdiAlIDEwID09IDA7IHYgLz0gMTAsIG4tLSApO1xuXG4gICAgICAgICAgICAgICAgLy8gQWRkIHRoZSBudW1iZXIgb2YgZGlnaXRzIG9mIHRoZSBmaXJzdCBlbGVtZW50LlxuICAgICAgICAgICAgICAgIGZvciAoIHYgPSBjWzBdOyB2ID49IDEwOyB2IC89IDEwLCBuKysgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCB6ICYmIHguZSArIDEgPiBuICkgbiA9IHguZSArIDE7XG5cbiAgICAgICAgICAgIHJldHVybiBuO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgcm91bmRlZCB0byBhIG1heGltdW0gb2ZcbiAgICAgICAgICogZHAgZGVjaW1hbCBwbGFjZXMgdXNpbmcgcm91bmRpbmcgbW9kZSBybSwgb3IgdG8gMCBhbmQgUk9VTkRJTkdfTU9ERSByZXNwZWN0aXZlbHkgaWZcbiAgICAgICAgICogb21pdHRlZC5cbiAgICAgICAgICpcbiAgICAgICAgICogW2RwXSB7bnVtYmVyfSBEZWNpbWFsIHBsYWNlcy4gSW50ZWdlciwgMCB0byBNQVggaW5jbHVzaXZlLlxuICAgICAgICAgKiBbcm1dIHtudW1iZXJ9IFJvdW5kaW5nIG1vZGUuIEludGVnZXIsIDAgdG8gOCBpbmNsdXNpdmUuXG4gICAgICAgICAqXG4gICAgICAgICAqICdyb3VuZCgpIGRlY2ltYWwgcGxhY2VzIG91dCBvZiByYW5nZToge2RwfSdcbiAgICAgICAgICogJ3JvdW5kKCkgZGVjaW1hbCBwbGFjZXMgbm90IGFuIGludGVnZXI6IHtkcH0nXG4gICAgICAgICAqICdyb3VuZCgpIHJvdW5kaW5nIG1vZGUgbm90IGFuIGludGVnZXI6IHtybX0nXG4gICAgICAgICAqICdyb3VuZCgpIHJvdW5kaW5nIG1vZGUgb3V0IG9mIHJhbmdlOiB7cm19J1xuICAgICAgICAgKi9cbiAgICAgICAgUC5yb3VuZCA9IGZ1bmN0aW9uICggZHAsIHJtICkge1xuICAgICAgICAgICAgdmFyIG4gPSBuZXcgQmlnTnVtYmVyKHRoaXMpO1xuXG4gICAgICAgICAgICBpZiAoIGRwID09IG51bGwgfHwgaXNWYWxpZEludCggZHAsIDAsIE1BWCwgMTUgKSApIHtcbiAgICAgICAgICAgICAgICByb3VuZCggbiwgfn5kcCArIHRoaXMuZSArIDEsIHJtID09IG51bGwgfHxcbiAgICAgICAgICAgICAgICAgICFpc1ZhbGlkSW50KCBybSwgMCwgOCwgMTUsIHJvdW5kaW5nTW9kZSApID8gUk9VTkRJTkdfTU9ERSA6IHJtIHwgMCApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gbjtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIG5ldyBCaWdOdW1iZXIgd2hvc2UgdmFsdWUgaXMgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIHNoaWZ0ZWQgYnkgayBwbGFjZXNcbiAgICAgICAgICogKHBvd2VycyBvZiAxMCkuIFNoaWZ0IHRvIHRoZSByaWdodCBpZiBuID4gMCwgYW5kIHRvIHRoZSBsZWZ0IGlmIG4gPCAwLlxuICAgICAgICAgKlxuICAgICAgICAgKiBrIHtudW1iZXJ9IEludGVnZXIsIC1NQVhfU0FGRV9JTlRFR0VSIHRvIE1BWF9TQUZFX0lOVEVHRVIgaW5jbHVzaXZlLlxuICAgICAgICAgKlxuICAgICAgICAgKiBJZiBrIGlzIG91dCBvZiByYW5nZSBhbmQgRVJST1JTIGlzIGZhbHNlLCB0aGUgcmVzdWx0IHdpbGwgYmUgwrEwIGlmIGsgPCAwLCBvciDCsUluZmluaXR5XG4gICAgICAgICAqIG90aGVyd2lzZS5cbiAgICAgICAgICpcbiAgICAgICAgICogJ3NoaWZ0KCkgYXJndW1lbnQgbm90IGFuIGludGVnZXI6IHtrfSdcbiAgICAgICAgICogJ3NoaWZ0KCkgYXJndW1lbnQgb3V0IG9mIHJhbmdlOiB7a30nXG4gICAgICAgICAqL1xuICAgICAgICBQLnNoaWZ0ID0gZnVuY3Rpb24gKGspIHtcbiAgICAgICAgICAgIHZhciBuID0gdGhpcztcbiAgICAgICAgICAgIHJldHVybiBpc1ZhbGlkSW50KCBrLCAtTUFYX1NBRkVfSU5URUdFUiwgTUFYX1NBRkVfSU5URUdFUiwgMTYsICdhcmd1bWVudCcgKVxuXG4gICAgICAgICAgICAgIC8vIGsgPCAxZSsyMSwgb3IgdHJ1bmNhdGUoaykgd2lsbCBwcm9kdWNlIGV4cG9uZW50aWFsIG5vdGF0aW9uLlxuICAgICAgICAgICAgICA/IG4udGltZXMoICcxZScgKyB0cnVuY2F0ZShrKSApXG4gICAgICAgICAgICAgIDogbmV3IEJpZ051bWJlciggbi5jICYmIG4uY1swXSAmJiAoIGsgPCAtTUFYX1NBRkVfSU5URUdFUiB8fCBrID4gTUFYX1NBRkVfSU5URUdFUiApXG4gICAgICAgICAgICAgICAgPyBuLnMgKiAoIGsgPCAwID8gMCA6IDEgLyAwIClcbiAgICAgICAgICAgICAgICA6IG4gKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqICBzcXJ0KC1uKSA9ICBOXG4gICAgICAgICAqICBzcXJ0KCBOKSA9ICBOXG4gICAgICAgICAqICBzcXJ0KC1JKSA9ICBOXG4gICAgICAgICAqICBzcXJ0KCBJKSA9ICBJXG4gICAgICAgICAqICBzcXJ0KCAwKSA9ICAwXG4gICAgICAgICAqICBzcXJ0KC0wKSA9IC0wXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybiBhIG5ldyBCaWdOdW1iZXIgd2hvc2UgdmFsdWUgaXMgdGhlIHNxdWFyZSByb290IG9mIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlcixcbiAgICAgICAgICogcm91bmRlZCBhY2NvcmRpbmcgdG8gREVDSU1BTF9QTEFDRVMgYW5kIFJPVU5ESU5HX01PREUuXG4gICAgICAgICAqL1xuICAgICAgICBQLnNxdWFyZVJvb3QgPSBQLnNxcnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgbSwgbiwgciwgcmVwLCB0LFxuICAgICAgICAgICAgICAgIHggPSB0aGlzLFxuICAgICAgICAgICAgICAgIGMgPSB4LmMsXG4gICAgICAgICAgICAgICAgcyA9IHgucyxcbiAgICAgICAgICAgICAgICBlID0geC5lLFxuICAgICAgICAgICAgICAgIGRwID0gREVDSU1BTF9QTEFDRVMgKyA0LFxuICAgICAgICAgICAgICAgIGhhbGYgPSBuZXcgQmlnTnVtYmVyKCcwLjUnKTtcblxuICAgICAgICAgICAgLy8gTmVnYXRpdmUvTmFOL0luZmluaXR5L3plcm8/XG4gICAgICAgICAgICBpZiAoIHMgIT09IDEgfHwgIWMgfHwgIWNbMF0gKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBCaWdOdW1iZXIoICFzIHx8IHMgPCAwICYmICggIWMgfHwgY1swXSApID8gTmFOIDogYyA/IHggOiAxIC8gMCApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBJbml0aWFsIGVzdGltYXRlLlxuICAgICAgICAgICAgcyA9IE1hdGguc3FydCggK3ggKTtcblxuICAgICAgICAgICAgLy8gTWF0aC5zcXJ0IHVuZGVyZmxvdy9vdmVyZmxvdz9cbiAgICAgICAgICAgIC8vIFBhc3MgeCB0byBNYXRoLnNxcnQgYXMgaW50ZWdlciwgdGhlbiBhZGp1c3QgdGhlIGV4cG9uZW50IG9mIHRoZSByZXN1bHQuXG4gICAgICAgICAgICBpZiAoIHMgPT0gMCB8fCBzID09IDEgLyAwICkge1xuICAgICAgICAgICAgICAgIG4gPSBjb2VmZlRvU3RyaW5nKGMpO1xuICAgICAgICAgICAgICAgIGlmICggKCBuLmxlbmd0aCArIGUgKSAlIDIgPT0gMCApIG4gKz0gJzAnO1xuICAgICAgICAgICAgICAgIHMgPSBNYXRoLnNxcnQobik7XG4gICAgICAgICAgICAgICAgZSA9IGJpdEZsb29yKCAoIGUgKyAxICkgLyAyICkgLSAoIGUgPCAwIHx8IGUgJSAyICk7XG5cbiAgICAgICAgICAgICAgICBpZiAoIHMgPT0gMSAvIDAgKSB7XG4gICAgICAgICAgICAgICAgICAgIG4gPSAnMWUnICsgZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBuID0gcy50b0V4cG9uZW50aWFsKCk7XG4gICAgICAgICAgICAgICAgICAgIG4gPSBuLnNsaWNlKCAwLCBuLmluZGV4T2YoJ2UnKSArIDEgKSArIGU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgciA9IG5ldyBCaWdOdW1iZXIobik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHIgPSBuZXcgQmlnTnVtYmVyKCBzICsgJycgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQ2hlY2sgZm9yIHplcm8uXG4gICAgICAgICAgICAvLyByIGNvdWxkIGJlIHplcm8gaWYgTUlOX0VYUCBpcyBjaGFuZ2VkIGFmdGVyIHRoZSB0aGlzIHZhbHVlIHdhcyBjcmVhdGVkLlxuICAgICAgICAgICAgLy8gVGhpcyB3b3VsZCBjYXVzZSBhIGRpdmlzaW9uIGJ5IHplcm8gKHgvdCkgYW5kIGhlbmNlIEluZmluaXR5IGJlbG93LCB3aGljaCB3b3VsZCBjYXVzZVxuICAgICAgICAgICAgLy8gY29lZmZUb1N0cmluZyB0byB0aHJvdy5cbiAgICAgICAgICAgIGlmICggci5jWzBdICkge1xuICAgICAgICAgICAgICAgIGUgPSByLmU7XG4gICAgICAgICAgICAgICAgcyA9IGUgKyBkcDtcbiAgICAgICAgICAgICAgICBpZiAoIHMgPCAzICkgcyA9IDA7XG5cbiAgICAgICAgICAgICAgICAvLyBOZXd0b24tUmFwaHNvbiBpdGVyYXRpb24uXG4gICAgICAgICAgICAgICAgZm9yICggOyA7ICkge1xuICAgICAgICAgICAgICAgICAgICB0ID0gcjtcbiAgICAgICAgICAgICAgICAgICAgciA9IGhhbGYudGltZXMoIHQucGx1cyggZGl2KCB4LCB0LCBkcCwgMSApICkgKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIGNvZWZmVG9TdHJpbmcoIHQuYyAgICkuc2xpY2UoIDAsIHMgKSA9PT0gKCBuID1cbiAgICAgICAgICAgICAgICAgICAgICAgICBjb2VmZlRvU3RyaW5nKCByLmMgKSApLnNsaWNlKCAwLCBzICkgKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZSBleHBvbmVudCBvZiByIG1heSBoZXJlIGJlIG9uZSBsZXNzIHRoYW4gdGhlIGZpbmFsIHJlc3VsdCBleHBvbmVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGUuZyAwLjAwMDk5OTkgKGUtNCkgLS0+IDAuMDAxIChlLTMpLCBzbyBhZGp1c3QgcyBzbyB0aGUgcm91bmRpbmcgZGlnaXRzXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBhcmUgaW5kZXhlZCBjb3JyZWN0bHkuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIHIuZSA8IGUgKSAtLXM7XG4gICAgICAgICAgICAgICAgICAgICAgICBuID0gbi5zbGljZSggcyAtIDMsIHMgKyAxICk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZSA0dGggcm91bmRpbmcgZGlnaXQgbWF5IGJlIGluIGVycm9yIGJ5IC0xIHNvIGlmIHRoZSA0IHJvdW5kaW5nIGRpZ2l0c1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYXJlIDk5OTkgb3IgNDk5OSAoaS5lLiBhcHByb2FjaGluZyBhIHJvdW5kaW5nIGJvdW5kYXJ5KSBjb250aW51ZSB0aGVcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGl0ZXJhdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICggbiA9PSAnOTk5OScgfHwgIXJlcCAmJiBuID09ICc0OTk5JyApIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE9uIHRoZSBmaXJzdCBpdGVyYXRpb24gb25seSwgY2hlY2sgdG8gc2VlIGlmIHJvdW5kaW5nIHVwIGdpdmVzIHRoZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGV4YWN0IHJlc3VsdCBhcyB0aGUgbmluZXMgbWF5IGluZmluaXRlbHkgcmVwZWF0LlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICggIXJlcCApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcm91bmQoIHQsIHQuZSArIERFQ0lNQUxfUExBQ0VTICsgMiwgMCApO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICggdC50aW1lcyh0KS5lcSh4KSApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHIgPSB0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkcCArPSA0O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHMgKz0gNDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXAgPSAxO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIHJvdW5kaW5nIGRpZ2l0cyBhcmUgbnVsbCwgMHswLDR9IG9yIDUwezAsM30sIGNoZWNrIGZvciBleGFjdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJlc3VsdC4gSWYgbm90LCB0aGVuIHRoZXJlIGFyZSBmdXJ0aGVyIGRpZ2l0cyBhbmQgbSB3aWxsIGJlIHRydXRoeS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoICErbiB8fCAhK24uc2xpY2UoMSkgJiYgbi5jaGFyQXQoMCkgPT0gJzUnICkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRydW5jYXRlIHRvIHRoZSBmaXJzdCByb3VuZGluZyBkaWdpdC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcm91bmQoIHIsIHIuZSArIERFQ0lNQUxfUExBQ0VTICsgMiwgMSApO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtID0gIXIudGltZXMocikuZXEoeCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByb3VuZCggciwgci5lICsgREVDSU1BTF9QTEFDRVMgKyAxLCBST1VORElOR19NT0RFLCBtICk7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiAgbiAqIDAgPSAwXG4gICAgICAgICAqICBuICogTiA9IE5cbiAgICAgICAgICogIG4gKiBJID0gSVxuICAgICAgICAgKiAgMCAqIG4gPSAwXG4gICAgICAgICAqICAwICogMCA9IDBcbiAgICAgICAgICogIDAgKiBOID0gTlxuICAgICAgICAgKiAgMCAqIEkgPSBOXG4gICAgICAgICAqICBOICogbiA9IE5cbiAgICAgICAgICogIE4gKiAwID0gTlxuICAgICAgICAgKiAgTiAqIE4gPSBOXG4gICAgICAgICAqICBOICogSSA9IE5cbiAgICAgICAgICogIEkgKiBuID0gSVxuICAgICAgICAgKiAgSSAqIDAgPSBOXG4gICAgICAgICAqICBJICogTiA9IE5cbiAgICAgICAgICogIEkgKiBJID0gSVxuICAgICAgICAgKlxuICAgICAgICAgKiBSZXR1cm4gYSBuZXcgQmlnTnVtYmVyIHdob3NlIHZhbHVlIGlzIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciB0aW1lcyB0aGUgdmFsdWUgb2ZcbiAgICAgICAgICogQmlnTnVtYmVyKHksIGIpLlxuICAgICAgICAgKi9cbiAgICAgICAgUC50aW1lcyA9IFAubXVsID0gZnVuY3Rpb24gKCB5LCBiICkge1xuICAgICAgICAgICAgdmFyIGMsIGUsIGksIGosIGssIG0sIHhjTCwgeGxvLCB4aGksIHljTCwgeWxvLCB5aGksIHpjLFxuICAgICAgICAgICAgICAgIGJhc2UsIHNxcnRCYXNlLFxuICAgICAgICAgICAgICAgIHggPSB0aGlzLFxuICAgICAgICAgICAgICAgIHhjID0geC5jLFxuICAgICAgICAgICAgICAgIHljID0gKCBpZCA9IDE3LCB5ID0gbmV3IEJpZ051bWJlciggeSwgYiApICkuYztcblxuICAgICAgICAgICAgLy8gRWl0aGVyIE5hTiwgwrFJbmZpbml0eSBvciDCsTA/XG4gICAgICAgICAgICBpZiAoICF4YyB8fCAheWMgfHwgIXhjWzBdIHx8ICF5Y1swXSApIHtcblxuICAgICAgICAgICAgICAgIC8vIFJldHVybiBOYU4gaWYgZWl0aGVyIGlzIE5hTiwgb3Igb25lIGlzIDAgYW5kIHRoZSBvdGhlciBpcyBJbmZpbml0eS5cbiAgICAgICAgICAgICAgICBpZiAoICF4LnMgfHwgIXkucyB8fCB4YyAmJiAheGNbMF0gJiYgIXljIHx8IHljICYmICF5Y1swXSAmJiAheGMgKSB7XG4gICAgICAgICAgICAgICAgICAgIHkuYyA9IHkuZSA9IHkucyA9IG51bGw7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgeS5zICo9IHgucztcblxuICAgICAgICAgICAgICAgICAgICAvLyBSZXR1cm4gwrFJbmZpbml0eSBpZiBlaXRoZXIgaXMgwrFJbmZpbml0eS5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCAheGMgfHwgIXljICkge1xuICAgICAgICAgICAgICAgICAgICAgICAgeS5jID0geS5lID0gbnVsbDtcblxuICAgICAgICAgICAgICAgICAgICAvLyBSZXR1cm4gwrEwIGlmIGVpdGhlciBpcyDCsTAuXG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB5LmMgPSBbMF07XG4gICAgICAgICAgICAgICAgICAgICAgICB5LmUgPSAwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGUgPSBiaXRGbG9vciggeC5lIC8gTE9HX0JBU0UgKSArIGJpdEZsb29yKCB5LmUgLyBMT0dfQkFTRSApO1xuICAgICAgICAgICAgeS5zICo9IHgucztcbiAgICAgICAgICAgIHhjTCA9IHhjLmxlbmd0aDtcbiAgICAgICAgICAgIHljTCA9IHljLmxlbmd0aDtcblxuICAgICAgICAgICAgLy8gRW5zdXJlIHhjIHBvaW50cyB0byBsb25nZXIgYXJyYXkgYW5kIHhjTCB0byBpdHMgbGVuZ3RoLlxuICAgICAgICAgICAgaWYgKCB4Y0wgPCB5Y0wgKSB6YyA9IHhjLCB4YyA9IHljLCB5YyA9IHpjLCBpID0geGNMLCB4Y0wgPSB5Y0wsIHljTCA9IGk7XG5cbiAgICAgICAgICAgIC8vIEluaXRpYWxpc2UgdGhlIHJlc3VsdCBhcnJheSB3aXRoIHplcm9zLlxuICAgICAgICAgICAgZm9yICggaSA9IHhjTCArIHljTCwgemMgPSBbXTsgaS0tOyB6Yy5wdXNoKDApICk7XG5cbiAgICAgICAgICAgIGJhc2UgPSBCQVNFO1xuICAgICAgICAgICAgc3FydEJhc2UgPSBTUVJUX0JBU0U7XG5cbiAgICAgICAgICAgIGZvciAoIGkgPSB5Y0w7IC0taSA+PSAwOyApIHtcbiAgICAgICAgICAgICAgICBjID0gMDtcbiAgICAgICAgICAgICAgICB5bG8gPSB5Y1tpXSAlIHNxcnRCYXNlO1xuICAgICAgICAgICAgICAgIHloaSA9IHljW2ldIC8gc3FydEJhc2UgfCAwO1xuXG4gICAgICAgICAgICAgICAgZm9yICggayA9IHhjTCwgaiA9IGkgKyBrOyBqID4gaTsgKSB7XG4gICAgICAgICAgICAgICAgICAgIHhsbyA9IHhjWy0ta10gJSBzcXJ0QmFzZTtcbiAgICAgICAgICAgICAgICAgICAgeGhpID0geGNba10gLyBzcXJ0QmFzZSB8IDA7XG4gICAgICAgICAgICAgICAgICAgIG0gPSB5aGkgKiB4bG8gKyB4aGkgKiB5bG87XG4gICAgICAgICAgICAgICAgICAgIHhsbyA9IHlsbyAqIHhsbyArICggKCBtICUgc3FydEJhc2UgKSAqIHNxcnRCYXNlICkgKyB6Y1tqXSArIGM7XG4gICAgICAgICAgICAgICAgICAgIGMgPSAoIHhsbyAvIGJhc2UgfCAwICkgKyAoIG0gLyBzcXJ0QmFzZSB8IDAgKSArIHloaSAqIHhoaTtcbiAgICAgICAgICAgICAgICAgICAgemNbai0tXSA9IHhsbyAlIGJhc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgemNbal0gPSBjO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYykge1xuICAgICAgICAgICAgICAgICsrZTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgemMuc2hpZnQoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG5vcm1hbGlzZSggeSwgemMsIGUgKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIG5ldyBCaWdOdW1iZXIgd2hvc2UgdmFsdWUgaXMgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIHJvdW5kZWQgdG8gYSBtYXhpbXVtIG9mXG4gICAgICAgICAqIHNkIHNpZ25pZmljYW50IGRpZ2l0cyB1c2luZyByb3VuZGluZyBtb2RlIHJtLCBvciBST1VORElOR19NT0RFIGlmIHJtIGlzIG9taXR0ZWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIFtzZF0ge251bWJlcn0gU2lnbmlmaWNhbnQgZGlnaXRzLiBJbnRlZ2VyLCAxIHRvIE1BWCBpbmNsdXNpdmUuXG4gICAgICAgICAqIFtybV0ge251bWJlcn0gUm91bmRpbmcgbW9kZS4gSW50ZWdlciwgMCB0byA4IGluY2x1c2l2ZS5cbiAgICAgICAgICpcbiAgICAgICAgICogJ3RvRGlnaXRzKCkgcHJlY2lzaW9uIG91dCBvZiByYW5nZToge3NkfSdcbiAgICAgICAgICogJ3RvRGlnaXRzKCkgcHJlY2lzaW9uIG5vdCBhbiBpbnRlZ2VyOiB7c2R9J1xuICAgICAgICAgKiAndG9EaWdpdHMoKSByb3VuZGluZyBtb2RlIG5vdCBhbiBpbnRlZ2VyOiB7cm19J1xuICAgICAgICAgKiAndG9EaWdpdHMoKSByb3VuZGluZyBtb2RlIG91dCBvZiByYW5nZToge3JtfSdcbiAgICAgICAgICovXG4gICAgICAgIFAudG9EaWdpdHMgPSBmdW5jdGlvbiAoIHNkLCBybSApIHtcbiAgICAgICAgICAgIHZhciBuID0gbmV3IEJpZ051bWJlcih0aGlzKTtcbiAgICAgICAgICAgIHNkID0gc2QgPT0gbnVsbCB8fCAhaXNWYWxpZEludCggc2QsIDEsIE1BWCwgMTgsICdwcmVjaXNpb24nICkgPyBudWxsIDogc2QgfCAwO1xuICAgICAgICAgICAgcm0gPSBybSA9PSBudWxsIHx8ICFpc1ZhbGlkSW50KCBybSwgMCwgOCwgMTgsIHJvdW5kaW5nTW9kZSApID8gUk9VTkRJTkdfTU9ERSA6IHJtIHwgMDtcbiAgICAgICAgICAgIHJldHVybiBzZCA/IHJvdW5kKCBuLCBzZCwgcm0gKSA6IG47XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gYSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBpbiBleHBvbmVudGlhbCBub3RhdGlvbiBhbmRcbiAgICAgICAgICogcm91bmRlZCB1c2luZyBST1VORElOR19NT0RFIHRvIGRwIGZpeGVkIGRlY2ltYWwgcGxhY2VzLlxuICAgICAgICAgKlxuICAgICAgICAgKiBbZHBdIHtudW1iZXJ9IERlY2ltYWwgcGxhY2VzLiBJbnRlZ2VyLCAwIHRvIE1BWCBpbmNsdXNpdmUuXG4gICAgICAgICAqIFtybV0ge251bWJlcn0gUm91bmRpbmcgbW9kZS4gSW50ZWdlciwgMCB0byA4IGluY2x1c2l2ZS5cbiAgICAgICAgICpcbiAgICAgICAgICogJ3RvRXhwb25lbnRpYWwoKSBkZWNpbWFsIHBsYWNlcyBub3QgYW4gaW50ZWdlcjoge2RwfSdcbiAgICAgICAgICogJ3RvRXhwb25lbnRpYWwoKSBkZWNpbWFsIHBsYWNlcyBvdXQgb2YgcmFuZ2U6IHtkcH0nXG4gICAgICAgICAqICd0b0V4cG9uZW50aWFsKCkgcm91bmRpbmcgbW9kZSBub3QgYW4gaW50ZWdlcjoge3JtfSdcbiAgICAgICAgICogJ3RvRXhwb25lbnRpYWwoKSByb3VuZGluZyBtb2RlIG91dCBvZiByYW5nZToge3JtfSdcbiAgICAgICAgICovXG4gICAgICAgIFAudG9FeHBvbmVudGlhbCA9IGZ1bmN0aW9uICggZHAsIHJtICkge1xuICAgICAgICAgICAgcmV0dXJuIGZvcm1hdCggdGhpcyxcbiAgICAgICAgICAgICAgZHAgIT0gbnVsbCAmJiBpc1ZhbGlkSW50KCBkcCwgMCwgTUFYLCAxOSApID8gfn5kcCArIDEgOiBudWxsLCBybSwgMTkgKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIGluIGZpeGVkLXBvaW50IG5vdGF0aW9uIHJvdW5kaW5nXG4gICAgICAgICAqIHRvIGRwIGZpeGVkIGRlY2ltYWwgcGxhY2VzIHVzaW5nIHJvdW5kaW5nIG1vZGUgcm0sIG9yIFJPVU5ESU5HX01PREUgaWYgcm0gaXMgb21pdHRlZC5cbiAgICAgICAgICpcbiAgICAgICAgICogTm90ZTogYXMgd2l0aCBKYXZhU2NyaXB0J3MgbnVtYmVyIHR5cGUsICgtMCkudG9GaXhlZCgwKSBpcyAnMCcsXG4gICAgICAgICAqIGJ1dCBlLmcuICgtMC4wMDAwMSkudG9GaXhlZCgwKSBpcyAnLTAnLlxuICAgICAgICAgKlxuICAgICAgICAgKiBbZHBdIHtudW1iZXJ9IERlY2ltYWwgcGxhY2VzLiBJbnRlZ2VyLCAwIHRvIE1BWCBpbmNsdXNpdmUuXG4gICAgICAgICAqIFtybV0ge251bWJlcn0gUm91bmRpbmcgbW9kZS4gSW50ZWdlciwgMCB0byA4IGluY2x1c2l2ZS5cbiAgICAgICAgICpcbiAgICAgICAgICogJ3RvRml4ZWQoKSBkZWNpbWFsIHBsYWNlcyBub3QgYW4gaW50ZWdlcjoge2RwfSdcbiAgICAgICAgICogJ3RvRml4ZWQoKSBkZWNpbWFsIHBsYWNlcyBvdXQgb2YgcmFuZ2U6IHtkcH0nXG4gICAgICAgICAqICd0b0ZpeGVkKCkgcm91bmRpbmcgbW9kZSBub3QgYW4gaW50ZWdlcjoge3JtfSdcbiAgICAgICAgICogJ3RvRml4ZWQoKSByb3VuZGluZyBtb2RlIG91dCBvZiByYW5nZToge3JtfSdcbiAgICAgICAgICovXG4gICAgICAgIFAudG9GaXhlZCA9IGZ1bmN0aW9uICggZHAsIHJtICkge1xuICAgICAgICAgICAgcmV0dXJuIGZvcm1hdCggdGhpcywgZHAgIT0gbnVsbCAmJiBpc1ZhbGlkSW50KCBkcCwgMCwgTUFYLCAyMCApXG4gICAgICAgICAgICAgID8gfn5kcCArIHRoaXMuZSArIDEgOiBudWxsLCBybSwgMjAgKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIGluIGZpeGVkLXBvaW50IG5vdGF0aW9uIHJvdW5kZWRcbiAgICAgICAgICogdXNpbmcgcm0gb3IgUk9VTkRJTkdfTU9ERSB0byBkcCBkZWNpbWFsIHBsYWNlcywgYW5kIGZvcm1hdHRlZCBhY2NvcmRpbmcgdG8gdGhlIHByb3BlcnRpZXNcbiAgICAgICAgICogb2YgdGhlIEZPUk1BVCBvYmplY3QgKHNlZSBCaWdOdW1iZXIuY29uZmlnKS5cbiAgICAgICAgICpcbiAgICAgICAgICogRk9STUFUID0ge1xuICAgICAgICAgKiAgICAgIGRlY2ltYWxTZXBhcmF0b3IgOiAnLicsXG4gICAgICAgICAqICAgICAgZ3JvdXBTZXBhcmF0b3IgOiAnLCcsXG4gICAgICAgICAqICAgICAgZ3JvdXBTaXplIDogMyxcbiAgICAgICAgICogICAgICBzZWNvbmRhcnlHcm91cFNpemUgOiAwLFxuICAgICAgICAgKiAgICAgIGZyYWN0aW9uR3JvdXBTZXBhcmF0b3IgOiAnXFx4QTAnLCAgICAvLyBub24tYnJlYWtpbmcgc3BhY2VcbiAgICAgICAgICogICAgICBmcmFjdGlvbkdyb3VwU2l6ZSA6IDBcbiAgICAgICAgICogfTtcbiAgICAgICAgICpcbiAgICAgICAgICogW2RwXSB7bnVtYmVyfSBEZWNpbWFsIHBsYWNlcy4gSW50ZWdlciwgMCB0byBNQVggaW5jbHVzaXZlLlxuICAgICAgICAgKiBbcm1dIHtudW1iZXJ9IFJvdW5kaW5nIG1vZGUuIEludGVnZXIsIDAgdG8gOCBpbmNsdXNpdmUuXG4gICAgICAgICAqXG4gICAgICAgICAqICd0b0Zvcm1hdCgpIGRlY2ltYWwgcGxhY2VzIG5vdCBhbiBpbnRlZ2VyOiB7ZHB9J1xuICAgICAgICAgKiAndG9Gb3JtYXQoKSBkZWNpbWFsIHBsYWNlcyBvdXQgb2YgcmFuZ2U6IHtkcH0nXG4gICAgICAgICAqICd0b0Zvcm1hdCgpIHJvdW5kaW5nIG1vZGUgbm90IGFuIGludGVnZXI6IHtybX0nXG4gICAgICAgICAqICd0b0Zvcm1hdCgpIHJvdW5kaW5nIG1vZGUgb3V0IG9mIHJhbmdlOiB7cm19J1xuICAgICAgICAgKi9cbiAgICAgICAgUC50b0Zvcm1hdCA9IGZ1bmN0aW9uICggZHAsIHJtICkge1xuICAgICAgICAgICAgdmFyIHN0ciA9IGZvcm1hdCggdGhpcywgZHAgIT0gbnVsbCAmJiBpc1ZhbGlkSW50KCBkcCwgMCwgTUFYLCAyMSApXG4gICAgICAgICAgICAgID8gfn5kcCArIHRoaXMuZSArIDEgOiBudWxsLCBybSwgMjEgKTtcblxuICAgICAgICAgICAgaWYgKCB0aGlzLmMgKSB7XG4gICAgICAgICAgICAgICAgdmFyIGksXG4gICAgICAgICAgICAgICAgICAgIGFyciA9IHN0ci5zcGxpdCgnLicpLFxuICAgICAgICAgICAgICAgICAgICBnMSA9ICtGT1JNQVQuZ3JvdXBTaXplLFxuICAgICAgICAgICAgICAgICAgICBnMiA9ICtGT1JNQVQuc2Vjb25kYXJ5R3JvdXBTaXplLFxuICAgICAgICAgICAgICAgICAgICBncm91cFNlcGFyYXRvciA9IEZPUk1BVC5ncm91cFNlcGFyYXRvcixcbiAgICAgICAgICAgICAgICAgICAgaW50UGFydCA9IGFyclswXSxcbiAgICAgICAgICAgICAgICAgICAgZnJhY3Rpb25QYXJ0ID0gYXJyWzFdLFxuICAgICAgICAgICAgICAgICAgICBpc05lZyA9IHRoaXMucyA8IDAsXG4gICAgICAgICAgICAgICAgICAgIGludERpZ2l0cyA9IGlzTmVnID8gaW50UGFydC5zbGljZSgxKSA6IGludFBhcnQsXG4gICAgICAgICAgICAgICAgICAgIGxlbiA9IGludERpZ2l0cy5sZW5ndGg7XG5cbiAgICAgICAgICAgICAgICBpZiAoZzIpIGkgPSBnMSwgZzEgPSBnMiwgZzIgPSBpLCBsZW4gLT0gaTtcblxuICAgICAgICAgICAgICAgIGlmICggZzEgPiAwICYmIGxlbiA+IDAgKSB7XG4gICAgICAgICAgICAgICAgICAgIGkgPSBsZW4gJSBnMSB8fCBnMTtcbiAgICAgICAgICAgICAgICAgICAgaW50UGFydCA9IGludERpZ2l0cy5zdWJzdHIoIDAsIGkgKTtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKCA7IGkgPCBsZW47IGkgKz0gZzEgKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRQYXJ0ICs9IGdyb3VwU2VwYXJhdG9yICsgaW50RGlnaXRzLnN1YnN0ciggaSwgZzEgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICggZzIgPiAwICkgaW50UGFydCArPSBncm91cFNlcGFyYXRvciArIGludERpZ2l0cy5zbGljZShpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzTmVnKSBpbnRQYXJ0ID0gJy0nICsgaW50UGFydDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBzdHIgPSBmcmFjdGlvblBhcnRcbiAgICAgICAgICAgICAgICAgID8gaW50UGFydCArIEZPUk1BVC5kZWNpbWFsU2VwYXJhdG9yICsgKCAoIGcyID0gK0ZPUk1BVC5mcmFjdGlvbkdyb3VwU2l6ZSApXG4gICAgICAgICAgICAgICAgICAgID8gZnJhY3Rpb25QYXJ0LnJlcGxhY2UoIG5ldyBSZWdFeHAoICdcXFxcZHsnICsgZzIgKyAnfVxcXFxCJywgJ2cnICksXG4gICAgICAgICAgICAgICAgICAgICAgJyQmJyArIEZPUk1BVC5mcmFjdGlvbkdyb3VwU2VwYXJhdG9yIClcbiAgICAgICAgICAgICAgICAgICAgOiBmcmFjdGlvblBhcnQgKVxuICAgICAgICAgICAgICAgICAgOiBpbnRQYXJ0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgc3RyaW5nIGFycmF5IHJlcHJlc2VudGluZyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgYXMgYSBzaW1wbGUgZnJhY3Rpb24gd2l0aFxuICAgICAgICAgKiBhbiBpbnRlZ2VyIG51bWVyYXRvciBhbmQgYW4gaW50ZWdlciBkZW5vbWluYXRvci4gVGhlIGRlbm9taW5hdG9yIHdpbGwgYmUgYSBwb3NpdGl2ZVxuICAgICAgICAgKiBub24temVybyB2YWx1ZSBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gdGhlIHNwZWNpZmllZCBtYXhpbXVtIGRlbm9taW5hdG9yLiBJZiBhIG1heGltdW1cbiAgICAgICAgICogZGVub21pbmF0b3IgaXMgbm90IHNwZWNpZmllZCwgdGhlIGRlbm9taW5hdG9yIHdpbGwgYmUgdGhlIGxvd2VzdCB2YWx1ZSBuZWNlc3NhcnkgdG9cbiAgICAgICAgICogcmVwcmVzZW50IHRoZSBudW1iZXIgZXhhY3RseS5cbiAgICAgICAgICpcbiAgICAgICAgICogW21kXSB7bnVtYmVyfHN0cmluZ3xCaWdOdW1iZXJ9IEludGVnZXIgPj0gMSBhbmQgPCBJbmZpbml0eS4gVGhlIG1heGltdW0gZGVub21pbmF0b3IuXG4gICAgICAgICAqXG4gICAgICAgICAqICd0b0ZyYWN0aW9uKCkgbWF4IGRlbm9taW5hdG9yIG5vdCBhbiBpbnRlZ2VyOiB7bWR9J1xuICAgICAgICAgKiAndG9GcmFjdGlvbigpIG1heCBkZW5vbWluYXRvciBvdXQgb2YgcmFuZ2U6IHttZH0nXG4gICAgICAgICAqL1xuICAgICAgICBQLnRvRnJhY3Rpb24gPSBmdW5jdGlvbiAobWQpIHtcbiAgICAgICAgICAgIHZhciBhcnIsIGQwLCBkMiwgZSwgZXhwLCBuLCBuMCwgcSwgcyxcbiAgICAgICAgICAgICAgICBrID0gRVJST1JTLFxuICAgICAgICAgICAgICAgIHggPSB0aGlzLFxuICAgICAgICAgICAgICAgIHhjID0geC5jLFxuICAgICAgICAgICAgICAgIGQgPSBuZXcgQmlnTnVtYmVyKE9ORSksXG4gICAgICAgICAgICAgICAgbjEgPSBkMCA9IG5ldyBCaWdOdW1iZXIoT05FKSxcbiAgICAgICAgICAgICAgICBkMSA9IG4wID0gbmV3IEJpZ051bWJlcihPTkUpO1xuXG4gICAgICAgICAgICBpZiAoIG1kICE9IG51bGwgKSB7XG4gICAgICAgICAgICAgICAgRVJST1JTID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgbiA9IG5ldyBCaWdOdW1iZXIobWQpO1xuICAgICAgICAgICAgICAgIEVSUk9SUyA9IGs7XG5cbiAgICAgICAgICAgICAgICBpZiAoICEoIGsgPSBuLmlzSW50KCkgKSB8fCBuLmx0KE9ORSkgKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKEVSUk9SUykge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmFpc2UoIDIyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAnbWF4IGRlbm9taW5hdG9yICcgKyAoIGsgPyAnb3V0IG9mIHJhbmdlJyA6ICdub3QgYW4gaW50ZWdlcicgKSwgbWQgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIEVSUk9SUyBpcyBmYWxzZTpcbiAgICAgICAgICAgICAgICAgICAgLy8gSWYgbWQgaXMgYSBmaW5pdGUgbm9uLWludGVnZXIgPj0gMSwgcm91bmQgaXQgdG8gYW4gaW50ZWdlciBhbmQgdXNlIGl0LlxuICAgICAgICAgICAgICAgICAgICBtZCA9ICFrICYmIG4uYyAmJiByb3VuZCggbiwgbi5lICsgMSwgMSApLmd0ZShPTkUpID8gbiA6IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoICF4YyApIHJldHVybiB4LnRvU3RyaW5nKCk7XG4gICAgICAgICAgICBzID0gY29lZmZUb1N0cmluZyh4Yyk7XG5cbiAgICAgICAgICAgIC8vIERldGVybWluZSBpbml0aWFsIGRlbm9taW5hdG9yLlxuICAgICAgICAgICAgLy8gZCBpcyBhIHBvd2VyIG9mIDEwIGFuZCB0aGUgbWluaW11bSBtYXggZGVub21pbmF0b3IgdGhhdCBzcGVjaWZpZXMgdGhlIHZhbHVlIGV4YWN0bHkuXG4gICAgICAgICAgICBlID0gZC5lID0gcy5sZW5ndGggLSB4LmUgLSAxO1xuICAgICAgICAgICAgZC5jWzBdID0gUE9XU19URU5bICggZXhwID0gZSAlIExPR19CQVNFICkgPCAwID8gTE9HX0JBU0UgKyBleHAgOiBleHAgXTtcbiAgICAgICAgICAgIG1kID0gIW1kIHx8IG4uY21wKGQpID4gMCA/ICggZSA+IDAgPyBkIDogbjEgKSA6IG47XG5cbiAgICAgICAgICAgIGV4cCA9IE1BWF9FWFA7XG4gICAgICAgICAgICBNQVhfRVhQID0gMSAvIDA7XG4gICAgICAgICAgICBuID0gbmV3IEJpZ051bWJlcihzKTtcblxuICAgICAgICAgICAgLy8gbjAgPSBkMSA9IDBcbiAgICAgICAgICAgIG4wLmNbMF0gPSAwO1xuXG4gICAgICAgICAgICBmb3IgKCA7IDsgKSAge1xuICAgICAgICAgICAgICAgIHEgPSBkaXYoIG4sIGQsIDAsIDEgKTtcbiAgICAgICAgICAgICAgICBkMiA9IGQwLnBsdXMoIHEudGltZXMoZDEpICk7XG4gICAgICAgICAgICAgICAgaWYgKCBkMi5jbXAobWQpID09IDEgKSBicmVhaztcbiAgICAgICAgICAgICAgICBkMCA9IGQxO1xuICAgICAgICAgICAgICAgIGQxID0gZDI7XG4gICAgICAgICAgICAgICAgbjEgPSBuMC5wbHVzKCBxLnRpbWVzKCBkMiA9IG4xICkgKTtcbiAgICAgICAgICAgICAgICBuMCA9IGQyO1xuICAgICAgICAgICAgICAgIGQgPSBuLm1pbnVzKCBxLnRpbWVzKCBkMiA9IGQgKSApO1xuICAgICAgICAgICAgICAgIG4gPSBkMjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZDIgPSBkaXYoIG1kLm1pbnVzKGQwKSwgZDEsIDAsIDEgKTtcbiAgICAgICAgICAgIG4wID0gbjAucGx1cyggZDIudGltZXMobjEpICk7XG4gICAgICAgICAgICBkMCA9IGQwLnBsdXMoIGQyLnRpbWVzKGQxKSApO1xuICAgICAgICAgICAgbjAucyA9IG4xLnMgPSB4LnM7XG4gICAgICAgICAgICBlICo9IDI7XG5cbiAgICAgICAgICAgIC8vIERldGVybWluZSB3aGljaCBmcmFjdGlvbiBpcyBjbG9zZXIgdG8geCwgbjAvZDAgb3IgbjEvZDFcbiAgICAgICAgICAgIGFyciA9IGRpdiggbjEsIGQxLCBlLCBST1VORElOR19NT0RFICkubWludXMoeCkuYWJzKCkuY21wKFxuICAgICAgICAgICAgICAgICAgZGl2KCBuMCwgZDAsIGUsIFJPVU5ESU5HX01PREUgKS5taW51cyh4KS5hYnMoKSApIDwgMVxuICAgICAgICAgICAgICAgICAgICA/IFsgbjEudG9TdHJpbmcoKSwgZDEudG9TdHJpbmcoKSBdXG4gICAgICAgICAgICAgICAgICAgIDogWyBuMC50b1N0cmluZygpLCBkMC50b1N0cmluZygpIF07XG5cbiAgICAgICAgICAgIE1BWF9FWFAgPSBleHA7XG4gICAgICAgICAgICByZXR1cm4gYXJyO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBjb252ZXJ0ZWQgdG8gYSBudW1iZXIgcHJpbWl0aXZlLlxuICAgICAgICAgKi9cbiAgICAgICAgUC50b051bWJlciA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciB4ID0gdGhpcztcblxuICAgICAgICAgICAgLy8gRW5zdXJlIHplcm8gaGFzIGNvcnJlY3Qgc2lnbi5cbiAgICAgICAgICAgIHJldHVybiAreCB8fCAoIHgucyA/IHgucyAqIDAgOiBOYU4gKTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgcmFpc2VkIHRvIHRoZSBwb3dlciBuLlxuICAgICAgICAgKiBJZiBuIGlzIG5lZ2F0aXZlIHJvdW5kIGFjY29yZGluZyB0byBERUNJTUFMX1BMQUNFUyBhbmQgUk9VTkRJTkdfTU9ERS5cbiAgICAgICAgICogSWYgUE9XX1BSRUNJU0lPTiBpcyBub3QgMCwgcm91bmQgdG8gUE9XX1BSRUNJU0lPTiB1c2luZyBST1VORElOR19NT0RFLlxuICAgICAgICAgKlxuICAgICAgICAgKiBuIHtudW1iZXJ9IEludGVnZXIsIC05MDA3MTk5MjU0NzQwOTkyIHRvIDkwMDcxOTkyNTQ3NDA5OTIgaW5jbHVzaXZlLlxuICAgICAgICAgKiAoUGVyZm9ybXMgNTQgbG9vcCBpdGVyYXRpb25zIGZvciBuIG9mIDkwMDcxOTkyNTQ3NDA5OTIuKVxuICAgICAgICAgKlxuICAgICAgICAgKiAncG93KCkgZXhwb25lbnQgbm90IGFuIGludGVnZXI6IHtufSdcbiAgICAgICAgICogJ3BvdygpIGV4cG9uZW50IG91dCBvZiByYW5nZToge259J1xuICAgICAgICAgKi9cbiAgICAgICAgUC50b1Bvd2VyID0gUC5wb3cgPSBmdW5jdGlvbiAobikge1xuICAgICAgICAgICAgdmFyIGssIHksXG4gICAgICAgICAgICAgICAgaSA9IG1hdGhmbG9vciggbiA8IDAgPyAtbiA6ICtuICksXG4gICAgICAgICAgICAgICAgeCA9IHRoaXM7XG5cbiAgICAgICAgICAgIC8vIFBhc3MgwrFJbmZpbml0eSB0byBNYXRoLnBvdyBpZiBleHBvbmVudCBpcyBvdXQgb2YgcmFuZ2UuXG4gICAgICAgICAgICBpZiAoICFpc1ZhbGlkSW50KCBuLCAtTUFYX1NBRkVfSU5URUdFUiwgTUFYX1NBRkVfSU5URUdFUiwgMjMsICdleHBvbmVudCcgKSAmJlxuICAgICAgICAgICAgICAoICFpc0Zpbml0ZShuKSB8fCBpID4gTUFYX1NBRkVfSU5URUdFUiAmJiAoIG4gLz0gMCApIHx8XG4gICAgICAgICAgICAgICAgcGFyc2VGbG9hdChuKSAhPSBuICYmICEoIG4gPSBOYU4gKSApICkge1xuICAgICAgICAgICAgICAgIHJldHVybiBuZXcgQmlnTnVtYmVyKCBNYXRoLnBvdyggK3gsIG4gKSApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBUcnVuY2F0aW5nIGVhY2ggY29lZmZpY2llbnQgYXJyYXkgdG8gYSBsZW5ndGggb2YgayBhZnRlciBlYWNoIG11bHRpcGxpY2F0aW9uIGVxdWF0ZXNcbiAgICAgICAgICAgIC8vIHRvIHRydW5jYXRpbmcgc2lnbmlmaWNhbnQgZGlnaXRzIHRvIFBPV19QUkVDSVNJT04gKyBbMjgsIDQxXSwgaS5lLiB0aGVyZSB3aWxsIGJlIGFcbiAgICAgICAgICAgIC8vIG1pbmltdW0gb2YgMjggZ3VhcmQgZGlnaXRzIHJldGFpbmVkLiAoVXNpbmcgKyAxLjUgd291bGQgZ2l2ZSBbOSwgMjFdIGd1YXJkIGRpZ2l0cy4pXG4gICAgICAgICAgICBrID0gUE9XX1BSRUNJU0lPTiA/IG1hdGhjZWlsKCBQT1dfUFJFQ0lTSU9OIC8gTE9HX0JBU0UgKyAyICkgOiAwO1xuICAgICAgICAgICAgeSA9IG5ldyBCaWdOdW1iZXIoT05FKTtcblxuICAgICAgICAgICAgZm9yICggOyA7ICkge1xuXG4gICAgICAgICAgICAgICAgaWYgKCBpICUgMiApIHtcbiAgICAgICAgICAgICAgICAgICAgeSA9IHkudGltZXMoeCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICggIXkuYyApIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIGsgJiYgeS5jLmxlbmd0aCA+IGsgKSB5LmMubGVuZ3RoID0gaztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpID0gbWF0aGZsb29yKCBpIC8gMiApO1xuICAgICAgICAgICAgICAgIGlmICggIWkgKSBicmVhaztcblxuICAgICAgICAgICAgICAgIHggPSB4LnRpbWVzKHgpO1xuICAgICAgICAgICAgICAgIGlmICggayAmJiB4LmMgJiYgeC5jLmxlbmd0aCA+IGsgKSB4LmMubGVuZ3RoID0gaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCBuIDwgMCApIHkgPSBPTkUuZGl2KHkpO1xuICAgICAgICAgICAgcmV0dXJuIGsgPyByb3VuZCggeSwgUE9XX1BSRUNJU0lPTiwgUk9VTkRJTkdfTU9ERSApIDogeTtcbiAgICAgICAgfTtcblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhIHN0cmluZyByZXByZXNlbnRpbmcgdGhlIHZhbHVlIG9mIHRoaXMgQmlnTnVtYmVyIHJvdW5kZWQgdG8gc2Qgc2lnbmlmaWNhbnQgZGlnaXRzXG4gICAgICAgICAqIHVzaW5nIHJvdW5kaW5nIG1vZGUgcm0gb3IgUk9VTkRJTkdfTU9ERS4gSWYgc2QgaXMgbGVzcyB0aGFuIHRoZSBudW1iZXIgb2YgZGlnaXRzXG4gICAgICAgICAqIG5lY2Vzc2FyeSB0byByZXByZXNlbnQgdGhlIGludGVnZXIgcGFydCBvZiB0aGUgdmFsdWUgaW4gZml4ZWQtcG9pbnQgbm90YXRpb24sIHRoZW4gdXNlXG4gICAgICAgICAqIGV4cG9uZW50aWFsIG5vdGF0aW9uLlxuICAgICAgICAgKlxuICAgICAgICAgKiBbc2RdIHtudW1iZXJ9IFNpZ25pZmljYW50IGRpZ2l0cy4gSW50ZWdlciwgMSB0byBNQVggaW5jbHVzaXZlLlxuICAgICAgICAgKiBbcm1dIHtudW1iZXJ9IFJvdW5kaW5nIG1vZGUuIEludGVnZXIsIDAgdG8gOCBpbmNsdXNpdmUuXG4gICAgICAgICAqXG4gICAgICAgICAqICd0b1ByZWNpc2lvbigpIHByZWNpc2lvbiBub3QgYW4gaW50ZWdlcjoge3NkfSdcbiAgICAgICAgICogJ3RvUHJlY2lzaW9uKCkgcHJlY2lzaW9uIG91dCBvZiByYW5nZToge3NkfSdcbiAgICAgICAgICogJ3RvUHJlY2lzaW9uKCkgcm91bmRpbmcgbW9kZSBub3QgYW4gaW50ZWdlcjoge3JtfSdcbiAgICAgICAgICogJ3RvUHJlY2lzaW9uKCkgcm91bmRpbmcgbW9kZSBvdXQgb2YgcmFuZ2U6IHtybX0nXG4gICAgICAgICAqL1xuICAgICAgICBQLnRvUHJlY2lzaW9uID0gZnVuY3Rpb24gKCBzZCwgcm0gKSB7XG4gICAgICAgICAgICByZXR1cm4gZm9ybWF0KCB0aGlzLCBzZCAhPSBudWxsICYmIGlzVmFsaWRJbnQoIHNkLCAxLCBNQVgsIDI0LCAncHJlY2lzaW9uJyApXG4gICAgICAgICAgICAgID8gc2QgfCAwIDogbnVsbCwgcm0sIDI0ICk7XG4gICAgICAgIH07XG5cblxuICAgICAgICAvKlxuICAgICAgICAgKiBSZXR1cm4gYSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSB2YWx1ZSBvZiB0aGlzIEJpZ051bWJlciBpbiBiYXNlIGIsIG9yIGJhc2UgMTAgaWYgYiBpc1xuICAgICAgICAgKiBvbWl0dGVkLiBJZiBhIGJhc2UgaXMgc3BlY2lmaWVkLCBpbmNsdWRpbmcgYmFzZSAxMCwgcm91bmQgYWNjb3JkaW5nIHRvIERFQ0lNQUxfUExBQ0VTIGFuZFxuICAgICAgICAgKiBST1VORElOR19NT0RFLiBJZiBhIGJhc2UgaXMgbm90IHNwZWNpZmllZCwgYW5kIHRoaXMgQmlnTnVtYmVyIGhhcyBhIHBvc2l0aXZlIGV4cG9uZW50XG4gICAgICAgICAqIHRoYXQgaXMgZXF1YWwgdG8gb3IgZ3JlYXRlciB0aGFuIFRPX0VYUF9QT1MsIG9yIGEgbmVnYXRpdmUgZXhwb25lbnQgZXF1YWwgdG8gb3IgbGVzcyB0aGFuXG4gICAgICAgICAqIFRPX0VYUF9ORUcsIHJldHVybiBleHBvbmVudGlhbCBub3RhdGlvbi5cbiAgICAgICAgICpcbiAgICAgICAgICogW2JdIHtudW1iZXJ9IEludGVnZXIsIDIgdG8gNjQgaW5jbHVzaXZlLlxuICAgICAgICAgKlxuICAgICAgICAgKiAndG9TdHJpbmcoKSBiYXNlIG5vdCBhbiBpbnRlZ2VyOiB7Yn0nXG4gICAgICAgICAqICd0b1N0cmluZygpIGJhc2Ugb3V0IG9mIHJhbmdlOiB7Yn0nXG4gICAgICAgICAqL1xuICAgICAgICBQLnRvU3RyaW5nID0gZnVuY3Rpb24gKGIpIHtcbiAgICAgICAgICAgIHZhciBzdHIsXG4gICAgICAgICAgICAgICAgbiA9IHRoaXMsXG4gICAgICAgICAgICAgICAgcyA9IG4ucyxcbiAgICAgICAgICAgICAgICBlID0gbi5lO1xuXG4gICAgICAgICAgICAvLyBJbmZpbml0eSBvciBOYU4/XG4gICAgICAgICAgICBpZiAoIGUgPT09IG51bGwgKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAocykge1xuICAgICAgICAgICAgICAgICAgICBzdHIgPSAnSW5maW5pdHknO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIHMgPCAwICkgc3RyID0gJy0nICsgc3RyO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHN0ciA9ICdOYU4nO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc3RyID0gY29lZmZUb1N0cmluZyggbi5jICk7XG5cbiAgICAgICAgICAgICAgICBpZiAoIGIgPT0gbnVsbCB8fCAhaXNWYWxpZEludCggYiwgMiwgNjQsIDI1LCAnYmFzZScgKSApIHtcbiAgICAgICAgICAgICAgICAgICAgc3RyID0gZSA8PSBUT19FWFBfTkVHIHx8IGUgPj0gVE9fRVhQX1BPU1xuICAgICAgICAgICAgICAgICAgICAgID8gdG9FeHBvbmVudGlhbCggc3RyLCBlIClcbiAgICAgICAgICAgICAgICAgICAgICA6IHRvRml4ZWRQb2ludCggc3RyLCBlICk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgc3RyID0gY29udmVydEJhc2UoIHRvRml4ZWRQb2ludCggc3RyLCBlICksIGIgfCAwLCAxMCwgcyApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICggcyA8IDAgJiYgbi5jWzBdICkgc3RyID0gJy0nICsgc3RyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gc3RyO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLypcbiAgICAgICAgICogUmV0dXJuIGEgbmV3IEJpZ051bWJlciB3aG9zZSB2YWx1ZSBpcyB0aGUgdmFsdWUgb2YgdGhpcyBCaWdOdW1iZXIgdHJ1bmNhdGVkIHRvIGEgd2hvbGVcbiAgICAgICAgICogbnVtYmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgUC50cnVuY2F0ZWQgPSBQLnRydW5jID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHJvdW5kKCBuZXcgQmlnTnVtYmVyKHRoaXMpLCB0aGlzLmUgKyAxLCAxICk7XG4gICAgICAgIH07XG5cblxuXG4gICAgICAgIC8qXG4gICAgICAgICAqIFJldHVybiBhcyB0b1N0cmluZywgYnV0IGRvIG5vdCBhY2NlcHQgYSBiYXNlIGFyZ3VtZW50LlxuICAgICAgICAgKi9cbiAgICAgICAgUC52YWx1ZU9mID0gUC50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy50b1N0cmluZygpO1xuICAgICAgICB9O1xuXG5cbiAgICAgICAgLy8gQWxpYXNlcyBmb3IgQmlnRGVjaW1hbCBtZXRob2RzLlxuICAgICAgICAvL1AuYWRkID0gUC5wbHVzOyAgICAgICAgIC8vIFAuYWRkIGluY2x1ZGVkIGFib3ZlXG4gICAgICAgIC8vUC5zdWJ0cmFjdCA9IFAubWludXM7ICAgLy8gUC5zdWIgaW5jbHVkZWQgYWJvdmVcbiAgICAgICAgLy9QLm11bHRpcGx5ID0gUC50aW1lczsgICAvLyBQLm11bCBpbmNsdWRlZCBhYm92ZVxuICAgICAgICAvL1AuZGl2aWRlID0gUC5kaXY7XG4gICAgICAgIC8vUC5yZW1haW5kZXIgPSBQLm1vZDtcbiAgICAgICAgLy9QLmNvbXBhcmVUbyA9IFAuY21wO1xuICAgICAgICAvL1AubmVnYXRlID0gUC5uZWc7XG5cblxuICAgICAgICBpZiAoIGNvbmZpZ09iaiAhPSBudWxsICkgQmlnTnVtYmVyLmNvbmZpZyhjb25maWdPYmopO1xuXG4gICAgICAgIHJldHVybiBCaWdOdW1iZXI7XG4gICAgfVxuXG5cbiAgICAvLyBQUklWQVRFIEhFTFBFUiBGVU5DVElPTlNcblxuXG4gICAgZnVuY3Rpb24gYml0Rmxvb3Iobikge1xuICAgICAgICB2YXIgaSA9IG4gfCAwO1xuICAgICAgICByZXR1cm4gbiA+IDAgfHwgbiA9PT0gaSA/IGkgOiBpIC0gMTtcbiAgICB9XG5cblxuICAgIC8vIFJldHVybiBhIGNvZWZmaWNpZW50IGFycmF5IGFzIGEgc3RyaW5nIG9mIGJhc2UgMTAgZGlnaXRzLlxuICAgIGZ1bmN0aW9uIGNvZWZmVG9TdHJpbmcoYSkge1xuICAgICAgICB2YXIgcywgeixcbiAgICAgICAgICAgIGkgPSAxLFxuICAgICAgICAgICAgaiA9IGEubGVuZ3RoLFxuICAgICAgICAgICAgciA9IGFbMF0gKyAnJztcblxuICAgICAgICBmb3IgKCA7IGkgPCBqOyApIHtcbiAgICAgICAgICAgIHMgPSBhW2krK10gKyAnJztcbiAgICAgICAgICAgIHogPSBMT0dfQkFTRSAtIHMubGVuZ3RoO1xuICAgICAgICAgICAgZm9yICggOyB6LS07IHMgPSAnMCcgKyBzICk7XG4gICAgICAgICAgICByICs9IHM7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEZXRlcm1pbmUgdHJhaWxpbmcgemVyb3MuXG4gICAgICAgIGZvciAoIGogPSByLmxlbmd0aDsgci5jaGFyQ29kZUF0KC0taikgPT09IDQ4OyApO1xuICAgICAgICByZXR1cm4gci5zbGljZSggMCwgaiArIDEgfHwgMSApO1xuICAgIH1cblxuXG4gICAgLy8gQ29tcGFyZSB0aGUgdmFsdWUgb2YgQmlnTnVtYmVycyB4IGFuZCB5LlxuICAgIGZ1bmN0aW9uIGNvbXBhcmUoIHgsIHkgKSB7XG4gICAgICAgIHZhciBhLCBiLFxuICAgICAgICAgICAgeGMgPSB4LmMsXG4gICAgICAgICAgICB5YyA9IHkuYyxcbiAgICAgICAgICAgIGkgPSB4LnMsXG4gICAgICAgICAgICBqID0geS5zLFxuICAgICAgICAgICAgayA9IHguZSxcbiAgICAgICAgICAgIGwgPSB5LmU7XG5cbiAgICAgICAgLy8gRWl0aGVyIE5hTj9cbiAgICAgICAgaWYgKCAhaSB8fCAhaiApIHJldHVybiBudWxsO1xuXG4gICAgICAgIGEgPSB4YyAmJiAheGNbMF07XG4gICAgICAgIGIgPSB5YyAmJiAheWNbMF07XG5cbiAgICAgICAgLy8gRWl0aGVyIHplcm8/XG4gICAgICAgIGlmICggYSB8fCBiICkgcmV0dXJuIGEgPyBiID8gMCA6IC1qIDogaTtcblxuICAgICAgICAvLyBTaWducyBkaWZmZXI/XG4gICAgICAgIGlmICggaSAhPSBqICkgcmV0dXJuIGk7XG5cbiAgICAgICAgYSA9IGkgPCAwO1xuICAgICAgICBiID0gayA9PSBsO1xuXG4gICAgICAgIC8vIEVpdGhlciBJbmZpbml0eT9cbiAgICAgICAgaWYgKCAheGMgfHwgIXljICkgcmV0dXJuIGIgPyAwIDogIXhjIF4gYSA/IDEgOiAtMTtcblxuICAgICAgICAvLyBDb21wYXJlIGV4cG9uZW50cy5cbiAgICAgICAgaWYgKCAhYiApIHJldHVybiBrID4gbCBeIGEgPyAxIDogLTE7XG5cbiAgICAgICAgaiA9ICggayA9IHhjLmxlbmd0aCApIDwgKCBsID0geWMubGVuZ3RoICkgPyBrIDogbDtcblxuICAgICAgICAvLyBDb21wYXJlIGRpZ2l0IGJ5IGRpZ2l0LlxuICAgICAgICBmb3IgKCBpID0gMDsgaSA8IGo7IGkrKyApIGlmICggeGNbaV0gIT0geWNbaV0gKSByZXR1cm4geGNbaV0gPiB5Y1tpXSBeIGEgPyAxIDogLTE7XG5cbiAgICAgICAgLy8gQ29tcGFyZSBsZW5ndGhzLlxuICAgICAgICByZXR1cm4gayA9PSBsID8gMCA6IGsgPiBsIF4gYSA/IDEgOiAtMTtcbiAgICB9XG5cblxuICAgIC8qXG4gICAgICogUmV0dXJuIHRydWUgaWYgbiBpcyBhIHZhbGlkIG51bWJlciBpbiByYW5nZSwgb3RoZXJ3aXNlIGZhbHNlLlxuICAgICAqIFVzZSBmb3IgYXJndW1lbnQgdmFsaWRhdGlvbiB3aGVuIEVSUk9SUyBpcyBmYWxzZS5cbiAgICAgKiBOb3RlOiBwYXJzZUludCgnMWUrMScpID09IDEgYnV0IHBhcnNlRmxvYXQoJzFlKzEnKSA9PSAxMC5cbiAgICAgKi9cbiAgICBmdW5jdGlvbiBpbnRWYWxpZGF0b3JOb0Vycm9ycyggbiwgbWluLCBtYXggKSB7XG4gICAgICAgIHJldHVybiAoIG4gPSB0cnVuY2F0ZShuKSApID49IG1pbiAmJiBuIDw9IG1heDtcbiAgICB9XG5cblxuICAgIGZ1bmN0aW9uIGlzQXJyYXkob2JqKSB7XG4gICAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqKSA9PSAnW29iamVjdCBBcnJheV0nO1xuICAgIH1cblxuXG4gICAgLypcbiAgICAgKiBDb252ZXJ0IHN0cmluZyBvZiBiYXNlSW4gdG8gYW4gYXJyYXkgb2YgbnVtYmVycyBvZiBiYXNlT3V0LlxuICAgICAqIEVnLiBjb252ZXJ0QmFzZSgnMjU1JywgMTAsIDE2KSByZXR1cm5zIFsxNSwgMTVdLlxuICAgICAqIEVnLiBjb252ZXJ0QmFzZSgnZmYnLCAxNiwgMTApIHJldHVybnMgWzIsIDUsIDVdLlxuICAgICAqL1xuICAgIGZ1bmN0aW9uIHRvQmFzZU91dCggc3RyLCBiYXNlSW4sIGJhc2VPdXQgKSB7XG4gICAgICAgIHZhciBqLFxuICAgICAgICAgICAgYXJyID0gWzBdLFxuICAgICAgICAgICAgYXJyTCxcbiAgICAgICAgICAgIGkgPSAwLFxuICAgICAgICAgICAgbGVuID0gc3RyLmxlbmd0aDtcblxuICAgICAgICBmb3IgKCA7IGkgPCBsZW47ICkge1xuICAgICAgICAgICAgZm9yICggYXJyTCA9IGFyci5sZW5ndGg7IGFyckwtLTsgYXJyW2FyckxdICo9IGJhc2VJbiApO1xuICAgICAgICAgICAgYXJyWyBqID0gMCBdICs9IEFMUEhBQkVULmluZGV4T2YoIHN0ci5jaGFyQXQoIGkrKyApICk7XG5cbiAgICAgICAgICAgIGZvciAoIDsgaiA8IGFyci5sZW5ndGg7IGorKyApIHtcblxuICAgICAgICAgICAgICAgIGlmICggYXJyW2pdID4gYmFzZU91dCAtIDEgKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmICggYXJyW2ogKyAxXSA9PSBudWxsICkgYXJyW2ogKyAxXSA9IDA7XG4gICAgICAgICAgICAgICAgICAgIGFycltqICsgMV0gKz0gYXJyW2pdIC8gYmFzZU91dCB8IDA7XG4gICAgICAgICAgICAgICAgICAgIGFycltqXSAlPSBiYXNlT3V0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBhcnIucmV2ZXJzZSgpO1xuICAgIH1cblxuXG4gICAgZnVuY3Rpb24gdG9FeHBvbmVudGlhbCggc3RyLCBlICkge1xuICAgICAgICByZXR1cm4gKCBzdHIubGVuZ3RoID4gMSA/IHN0ci5jaGFyQXQoMCkgKyAnLicgKyBzdHIuc2xpY2UoMSkgOiBzdHIgKSArXG4gICAgICAgICAgKCBlIDwgMCA/ICdlJyA6ICdlKycgKSArIGU7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiB0b0ZpeGVkUG9pbnQoIHN0ciwgZSApIHtcbiAgICAgICAgdmFyIGxlbiwgejtcblxuICAgICAgICAvLyBOZWdhdGl2ZSBleHBvbmVudD9cbiAgICAgICAgaWYgKCBlIDwgMCApIHtcblxuICAgICAgICAgICAgLy8gUHJlcGVuZCB6ZXJvcy5cbiAgICAgICAgICAgIGZvciAoIHogPSAnMC4nOyArK2U7IHogKz0gJzAnICk7XG4gICAgICAgICAgICBzdHIgPSB6ICsgc3RyO1xuXG4gICAgICAgIC8vIFBvc2l0aXZlIGV4cG9uZW50XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZW4gPSBzdHIubGVuZ3RoO1xuXG4gICAgICAgICAgICAvLyBBcHBlbmQgemVyb3MuXG4gICAgICAgICAgICBpZiAoICsrZSA+IGxlbiApIHtcbiAgICAgICAgICAgICAgICBmb3IgKCB6ID0gJzAnLCBlIC09IGxlbjsgLS1lOyB6ICs9ICcwJyApO1xuICAgICAgICAgICAgICAgIHN0ciArPSB6O1xuICAgICAgICAgICAgfSBlbHNlIGlmICggZSA8IGxlbiApIHtcbiAgICAgICAgICAgICAgICBzdHIgPSBzdHIuc2xpY2UoIDAsIGUgKSArICcuJyArIHN0ci5zbGljZShlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuXG5cbiAgICBmdW5jdGlvbiB0cnVuY2F0ZShuKSB7XG4gICAgICAgIG4gPSBwYXJzZUZsb2F0KG4pO1xuICAgICAgICByZXR1cm4gbiA8IDAgPyBtYXRoY2VpbChuKSA6IG1hdGhmbG9vcihuKTtcbiAgICB9XG5cblxuICAgIC8vIEVYUE9SVFxuXG5cbiAgICBCaWdOdW1iZXIgPSBhbm90aGVyKCk7XG5cbiAgICAvLyBBTUQuXG4gICAgaWYgKCB0eXBlb2YgZGVmaW5lID09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCApIHtcbiAgICAgICAgZGVmaW5lKCBmdW5jdGlvbiAoKSB7IHJldHVybiBCaWdOdW1iZXI7IH0gKTtcblxuICAgIC8vIE5vZGUgYW5kIG90aGVyIGVudmlyb25tZW50cyB0aGF0IHN1cHBvcnQgbW9kdWxlLmV4cG9ydHMuXG4gICAgfSBlbHNlIGlmICggdHlwZW9mIG1vZHVsZSAhPSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cyApIHtcbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBCaWdOdW1iZXI7XG4gICAgICAgIGlmICggIWNyeXB0byApIHRyeSB7IGNyeXB0byA9IHJlcXVpcmUoJ2NyeXB0bycpOyB9IGNhdGNoIChlKSB7fVxuXG4gICAgLy8gQnJvd3Nlci5cbiAgICB9IGVsc2Uge1xuICAgICAgICBnbG9iYWwuQmlnTnVtYmVyID0gQmlnTnVtYmVyO1xuICAgIH1cbn0pKHRoaXMpO1xuIiwidmFyIHdlYjMgPSByZXF1aXJlKCcuL2xpYi93ZWIzJyk7XG53ZWIzLnByb3ZpZGVycy5IdHRwUHJvdmlkZXIgPSByZXF1aXJlKCcuL2xpYi93ZWIzL2h0dHBwcm92aWRlcicpO1xud2ViMy5wcm92aWRlcnMuUXRTeW5jUHJvdmlkZXIgPSByZXF1aXJlKCcuL2xpYi93ZWIzL3F0c3luYycpO1xud2ViMy5ldGguY29udHJhY3QgPSByZXF1aXJlKCcuL2xpYi93ZWIzL2NvbnRyYWN0Jyk7XG53ZWIzLmV0aC5uYW1lcmVnID0gcmVxdWlyZSgnLi9saWIvd2ViMy9uYW1lcmVnJyk7XG53ZWIzLmV0aC5zZW5kSUJBTlRyYW5zYWN0aW9uID0gcmVxdWlyZSgnLi9saWIvd2ViMy90cmFuc2ZlcicpO1xuXG4vLyBkb250IG92ZXJyaWRlIGdsb2JhbCB2YXJpYWJsZVxuaWYgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiB3aW5kb3cud2ViMyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICB3aW5kb3cud2ViMyA9IHdlYjM7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gd2ViMztcblxuIl19
