import observer from '@cocreate/observer';
import {setValue} from './setValue';

function initGetValues() {
	var elements = document.querySelectorAll('[get-value]');
	initElements(elements)
}

function initElements(elements) {
	for (let element of elements)
		initElement(element)
}

function initElement(element) {
    let id = element.getAttribute('get-value')
	let valueEl = document.getElementById(id);
	if(!valueEl) return;
	let value = getValue(valueEl)
	setValue(element, value)
	
	// if (['INPUT', 'TEXTAREA', 'SELECT'].includes(valueEl.tagName)  || valueEl.contentEditable)
	
	// valueEl.addEventListener('input', (e) => {
	// 	setValueByFind(e.target)
	// })
	
	// valueEl.addEventListener('updated_by_fetch', (e) => {
	// 	setValueByFind(e.target)
	// })
	
	initEvents(valueEl);

	element.dispatchEvent(new Event("input", {
		"bubbles": true
	}));

}

const valueEls = new Map();
function initEvents(valueEl){
	if (!valueEls.has(valueEl)) {
		valueEls.set(valueEl);
		if (['INPUT', 'TEXTAREA', 'SELECT'].includes(valueEl.tagName)  || valueEl.contentEditable)
			valueEl.addEventListener('input', (e) => {
				setValueByFind(e.target)
			})
		
		valueEl.addEventListener('updated_by_fetch', (e) => {
			setValueByFind(e.target)
		})
	}
}

function setValueByFind(valueEl){
	let value = getValue(valueEl)
    let id = valueEl.getAttribute('id')
    if(!id) return;
	var elements = document.querySelectorAll('[get-value="' + id + '"]');
	for(let element of elements)
		setValue(element, value)
}

var getValue = (element) => {
	let value = element.value;
	let prefix = element.getAttribute('value-prefix') || "";
	let suffix = element.getAttribute('value-suffix') || "";

	if (element.type === "checkbox") {
		let el_name = element.getAttribute('name');
		let checkboxs = document.querySelectorAll(`input[type=checkbox][name='${el_name}']`);
		if (checkboxs.length > 1) {
			value = [];
			checkboxs.forEach(el => {
				if (el.checked) value.push(el.value);
			});
		}
		else {
			value = element.checked;
		}
	}
	else if (element.type === "number") {
		value = Number(value);
	}
	else if (element.type === "password") {
		value = __encryptPassword(value);
	}
	else if (element.tagName == "SELECT" && element.hasAttribute('multiple')) {
		let options = element.selectedOptions;
		value = [];
		for (let i = 0; i < options.length; i++) {
			value.push(options[i].value);
		}
	}
	else if (element.tagName == 'INPUT' || element.tagName == 'TEXTAREA' || element.tagName == 'SELECT') {
		value = element.value;
	}
	else if (element.tagName === 'IFRAME') {
		value = element.srcdoc;
	}
	else {
		value = element.innerHTML;
	}
	if (prefix || suffix)
		value = prefix + value + suffix;

	return value;
};

function __encryptPassword(str) {
	let encodedString = btoa(str);
	return encodedString;
}

observer.init({
	name: 'get-value',
	observe: ['addedNodes'],
	target: '[get-value]',
	callback: function(mutation) {
		initElement(mutation.target);
	}
});

initGetValues();
export {getValue};
