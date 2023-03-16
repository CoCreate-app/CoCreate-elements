import observer from '@cocreate/observer';
import action from '@cocreate/actions';
import crud from '@cocreate/crud-client';
import ccfilter from '@cocreate/filter';
import '@cocreate/element-prototype';
import './fetchSrc';


const selector = "[collection][name]:not(cocreate-select, link), input, textarea, select, [contenteditable]";
const initializing = new Map();
const els = new Map();

function init() {
	let elements = document.querySelectorAll(selector);
	__initSocket();
	initElements(elements);
}

function initElements(elements) {
	let documents = new Map();
	// let els = []
	for (let element of elements){
		let doc = initElement(element);
		if (doc) {
			let key = JSON.stringify(doc)
			let item = documents.get(key);
			if (item)
				doc.elements = [...item.elements, element]
			else
				doc.elements = [element]

			// let collection = doc.collection;
			// let document_id = doc.document_id;
			// let filter = doc.filter;
			let initialize = initializing.get(element)
			if (!initialize){
				initializing.set(element, key);
				documents.set(key, doc);
				// els.set(key, doc);
				// els.push(element)
			} else {
				// if (document_id && initialize.document_id != document_id || filter && JSON.stringify(initialize.filter) != JSON.stringify(filter)){
				if (initialize != key){
					initializing.set(element, key);
					documents.set(key, doc);
					// els.set(key, doc);
					// els.push(element)
				}
			}
		}
	}
	
	read(documents);
}
	
function initElement(el) {
	__initEvents(el);

	if (el.closest('.template')) return;

	// if rendered in server side skip 
	if (el.hasAttribute('rendered')) {
		el.removeAttribute('rendered');
		return;
	}
	
	const { collection, document_id, name, isRead } = crud.getAttributes(el);
	if (!collection || !name) return;

	if (document_id)
		if (!document_id.match(/^[0-9a-fA-F]{24}$/)) return; 
	
	let filter
	if (el.hasAttribute('filter_id') || el.hasAttribute('filter-name' ) || el.hasAttribute('filter-sort-name')) {	
		filter = ccfilter.init(el, "filter_id");
	}

	if (!crud.checkValue(collection) || !crud.checkValue(name)) return;
	 
	if (isRead == 'false') return;
	if (!document_id && !filter) return;

	return {collection, document_id, filter};
}
	
async function read(documents) {
	if (documents && documents.size > 0) {
		for (let [key, {collection, document_id, filter, elements}] of documents) {
			documents.delete(key);

			let data = {collection}
			if (document_id)
				data.document = {_id: document_id}
			if (filter)
				data.filter = filter
			
			let response = await crud.readDocument(data);
			setData(elements, response);
		}
	}
}
	
function setData(elements, data) {
	if (!data.document || !data.document[0]) return;
	let key = getKey(data)
	if (!elements) {
		elements = els.get(key)
	} else {
		let eles = els.get(key)
		if (eles && eles.length)
			els.set(key, [...eles, ...elements])
		else
			els.set(key, elements)
	}
	if (!elements || elements.length == 0)
		return
	
	for (let el of elements) {
		const { collection, document_id, name, isRead, isUpdate, isCrdt } = crud.getAttributes(el);
		
		if (el.hasAttribute('actions') || el.tagName === 'DIV' && !el.classList.contains('domEditor')) continue;
		if (!name || isRead == "false" || isUpdate == "false" || isCrdt == "true") continue;
		
		if (data.document[0]['collection'] == collection && data.document[0]['_id'] == document_id) {
			let value = crud.getValueFromObject(data.document[0], name);
			el.setValue(value);
			initializing.delete(el)
		}
	}
}

function getKey(data) {
	let key = {};
	let attributes = ["db", "database", "collection", "index", "document"]

	for (let attribute of attributes) {
		let value = data[attribute]
		if (value) {
			if (attribute == 'document')
			key[attribute] = value
		} 
	}
	key.document = data.document[0]._id
	return JSON.stringify(key)
}

async function save(element) {
	let value = element.getValue();
	crud.save(element, value);
}

function __initSocket() {
	crud.listen('updateDocument', function(data) {
		setData(null, data);
	});
}

const elementEvents = new Map();
function __initEvents(el) {
	if (!elementEvents.has(el)) {
		if (el.tagName == 'INPUT' || el.tagName == 'TEXTAREA' || el.tagName == 'SELECT' || el.hasAttribute('contenteditable')) {
			el.addEventListener('input', function(e) {
				const {document_id, name, isRealtime, isCrdt} = crud.getAttributes(el);
				if (isCrdt == "true" && document_id && document_id != 'pending' || isRealtime == "false" || name == "_id") return;
				if (document_id && e.detail && e.detail.skip == true) return;
				save(el);
			});

			elementEvents.set(el, true)
		}
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
	attributeName: crud.getAttributeNames(['collection', 'document_id', 'name']),
	target: selector,
	callback: function(mutation) {
		let {collection, document_id, name} = crud.getAttributes(mutation.target);
		if (collection && document_id && name)
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

export default {initElements, initElement, save};
