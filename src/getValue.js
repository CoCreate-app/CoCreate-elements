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
	value = prefix + value + suffix;

	return value;
};

function __encryptPassword(str) {
	let encodedString = btoa(str);
	return encodedString;
}

export {getValue};
