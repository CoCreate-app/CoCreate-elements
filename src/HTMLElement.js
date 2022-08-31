import { setValue } from './setValue';
import { getValue } from './getValue';

HTMLElement.prototype.getValue = function() {
	let value = getValue(this)
	return value;
};

HTMLElement.prototype.setValue = function(value) {
	setValue(this, value)
};

HTMLInputElement.prototype.getValue = function() {
	let value = getValue(this)
	return value;
};

HTMLInputElement.prototype.setValue = function(value) {
	setValue(this, value)
};

HTMLHeadingElement.prototype.getValue = function() {
	let value = getValue(this)
	return value;
};

HTMLHeadingElement.prototype.setValue = function(value) {
	setValue(this, value)
};

