import observer from '@cocreate/observer';
import action from '@cocreate/actions';
import crud from '@cocreate/crud-client';
import { initSetValues, setValue } from './setValue';
import { initGetValues, getValue } from './getValue';

const selector = "[collection][document_id][name]:not(cocreate-select, link), input, textarea, select, [contenteditable]";

function init() {
	let elements = document.querySelectorAll(selector);
	__initSocket();
	initElements(elements);
}

function initElements(elements) {
	let documents = new Map();
	for (let element of elements){
		let doc = initElement(element);
		if (doc) {
			let collection = doc.collection;
			let document_id = doc.document_id;
			documents.set(`${collection}${document_id}`, {collection, document_id});
		}
	}
	read(documents, elements);
}
	
function initElement(el) {
	if (el.tagName != 'DIV' || el.classList.contains('domEditor') || el.hasAttribute('contenteditable')){
		el.getValue = getValue; 
		el.setValue = setValue; 
	}
	// if rendered in server side skip 
	if (el.hasAttribute('rendered')) {
		el.removeAttribute('rendered');
		return;
	}
	
	if (el.closest('.template')) return;

	const { collection, document_id, name, isRead } = crud.getAttr(el);
	__initEvents(el);
	if (!collection || !document_id || !name) return;
	if (!document_id.match(/^[0-9a-fA-F]{24}$/)) return; 
	if (!crud.checkAttrValue(collection) || !crud.checkAttrValue(name)) return;
	 
	if (isRead == 'false') return;
	return {collection, document_id};
}
	
async function read(documents, elements) {
	if (documents && documents.size > 0) {
		for (let [key, {collection, document_id}] of documents) {
			documents.delete(key);
			var responseData = await crud.readDocument({
				collection: collection,
				document_id: document_id,
			});
			setData(elements, responseData);
		}
	}
}
	
function setData(elements, data) {
	let isRendered = false;
	if (!data) return;
	if (!elements) {
		let collection = data.collection;
		let document_id = data.document_id;
		let selector = `[collection='${collection}'][document_id='${document_id}']:not(cocreate-select, link)`;
		elements = document.querySelectorAll(selector);
	}
	let encodeData = crud.encodeObject(data.data);

	elements.forEach((el) => {
		const { collection, document_id, name, isRead, isUpdate, isCrdt } = crud.getAttr(el);
		if (el.hasAttribute('actions')) return;
		if (isRead == "false" || isUpdate == "false" || isCrdt == "true") return;
		// let isEditable = el.getAttribute('contenteditable');
		
		// if (data['collection'] == collection && data['document_id'] == document_id && !isEditable) {
		if (data['collection'] == collection && data['document_id'] == document_id) {
			const value = encodeData[name];
			setValue(el, value);

			isRendered = true;
		}
	});

	if (isRendered) {
		// ToDo: Replace with custom event
		const event = new CustomEvent('CoCreateElements-rendered', {
			eventType: 'rendered',
			detail: {
				data: data
			}
		});

		document.dispatchEvent(event);
	}
}

async function save(element) {
	let value = getValue(element);
	let isFlat = false;
	// if (element.tagName == "INPUT" && element.type === "checkbox" || element.tagName == "SELECT" && element.hasAttribute('multiple'))
		// isFlat = true;
	await crud.save(element, value, isFlat);
}

function __initSocket() {
	crud.listen('updateDocument', function(data) {
		setData(null, data);
	});
}
	
function __initEvents(el) {
	if (el.tagName == 'INPUT' || el.tagName == 'TEXTAREA' || el.tagName == 'SELECT' || el.hasAttribute('contenteditable')) {
		el.addEventListener('input', function(e) {
			const {document_id, isRealtime, isCrdt} = crud.getAttr(el);
			if (isCrdt == "true" && document_id || isRealtime == "false") return;
			if (document_id && e.detail && e.detail.skip == true) return;
			save(el);
		});

		// el.addEventListener('change', function(e) {
		// 	if (el.tagName == 'SELECT') {
		// 		const {isRealtime, isSave, isUpdate} = crud.getAttr(el);
		// 		if (isRealtime == "false" || isSave == "false" || isUpdate == "false")	return;
		// 		if (e.detail && e.detail.skip == true) return;
		// 		save(el);
		// 	}
		// });
	}
}

observer.init({
	name: 'CoCreateElementsChildList',
	observe: ['childList'],
	target: selector,
	callback: function(mutation) {
		initElements(mutation.addedNodes);
	}
});

observer.init({
	name: 'CoCreateElementsAttributes',
	observe: ['attributes'],
	attributeName: ['collection', 'document_id', 'name'],
	target: selector,
	callback: function(mutation) {
		let {collection, document_id, name} = crud.getAttr(mutation.target);
		if(collection && document_id && name)
			initElements([mutation.target]);
	}
});

action.init({
	name: "saveHtml",
	endEvent: "changed-element",
	callback: (btn, data) => {
		let form = btn.closet('form');
		save(form);
	},
});

init();
initGetValues();
initSetValues();


export default {initElements, initElement, save, getValue, setValue};
