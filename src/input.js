/*globals atob, btoa, CustomEvent*/
import observer from '@cocreate/observer';
import form from '@cocreate/form';

const CoCreateInput = {

	setValues: function(data) {
		let collection = data.collection;
		let document_id = data.document_id;
		let selectors = `[collection='${collection}'][document_id='${document_id}']`;
		let inputs = document.querySelectorAll(`input${selectors}, textarea${selectors}, select${selectors}`);

		let self = this;

		inputs.forEach((input) => {
			self.initElement(input, data);
		});

	},
	
	getValues: function(form, collection, document_id = '') {
		let data = {};
		let selectors = `[collection='${collection}'][document_id='${document_id}']`;
		let inputs = document.querySelectorAll(`input${selectors}, textarea${selectors}, select${selectors}`);
		for (let input of inputs) {
			let name = input.getAttribute('name');
			data[name] = this.getValue(input);
		}
		return data;
	},
	


};

CoCreateInput.init();

observer.init({
	name: 'CoCreateInput',
	observe: ['addedNodes'],
	target: 'input[collection][document_id][name], textarea[collection][document_id][name], select[collection][document_id][name]',
	callback: (mutation) => {
		CoCreateInput.initElement(mutation.target);
	}
});

observer.init({
	name: 'CoCreateInputDocumentObserver',
	observe: ['attributes'],
	attributeName: ['collection', 'document_id', 'name'],
	target: 'input, textarea, select',
	callback: function(mutation) {
		CoCreateInput.initElement(mutation.target);
	}
});

form.init({
	name: 'CoCreateInput',
	selector: "input, textarea, select",
	callback: function(form, collection, document_id) {
		return CoCreateInput.getValues(form, collection, document_id);
	}
});

export default CoCreateInput;
