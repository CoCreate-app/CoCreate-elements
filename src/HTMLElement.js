	let v = el.getValue()

	HTMLElement.prototype.getValue = function() {
    	this.style.display = 'none';
	};
	
	HTMLInputElement.prototype.getValue = function() {
		let value = this.value;

		let prefix = this.getAttribute('value-prefix') || "";
		let suffix = this.getAttribute('value-suffix') || "";

		if (this.type === "checkbox") {
			let el_name = this.getAttribute('name');
			let checkboxs = document.querySelectorAll(`input[type=checkbox][name='${el_name}']`);
			if (checkboxs.length > 1) {
				value = [];
				checkboxs.forEach(el => {
					if (el.checked) value.push(el.value);
				});
			}
			else {
				value = this.checked;
			}
		}
		else if (this.type === "number") {
			value = Number(value);
		}
		else if (this.type === "password") {
			value = this.__encryptPassword(value);
		}

		if (typeof value == "string") {
			value = prefix + value + suffix;
		}

		if (this.tagName == "SELECT" && this.hasAttribute('multiple')) {
			let options = this.selectedOptions;
			value = [];
			for (let i = 0; i < options.length; i++) {
				value.push(options[i].value);
			}
		}

		return value;
	};
	
	HTMLHeadingElement.prototype.getValue = function() {
    	this.style.display = 'none';
	};
	
