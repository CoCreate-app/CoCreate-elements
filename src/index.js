/********************************************************************************
 * Copyright (C) 2023 CoCreate and Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 ********************************************************************************/

// Commercial Licensing Information:
// For commercial use of this software without the copyleft provisions of the AGPLv3,
// you must obtain a commercial license from CoCreate LLC.
// For details, visit <https://cocreate.app/licenses/> or contact us at sales@cocreate.app.

import Observer from '@cocreate/observer';
import Actions from '@cocreate/actions';
import CRUD from '@cocreate/crud-client';
import { dotNotationToObject, queryData, sortData } from '@cocreate/utils';
import '@cocreate/filter';
import { render } from '@cocreate/render';
import '@cocreate/element-prototype';
import './fetchSrc';
import { reset } from './form'

const selector = "[storage], [database], [array], [render-json]";
const elements = new Map();
const keys = new Map();
const forms = new Map(); // form, [elements]
const debounce = new Map();

function init(element) {
    if (element && !(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element]
    else if (!element) {
        element = document.querySelectorAll(selector)
        initSocket();
    }

    let dataObjects = new Map();
    for (let i = 0; i < element.length; i++) {
        if (elements.has(element[i]) || element.tagName === 'FORM')
            continue

        let data = initElement(element[i]);
        if (data) {
            let dataKey = initDataKey(element[i], data)
            dataObjects.set(dataKey.string, data)
        }
    }

    if (dataObjects && dataObjects.size > 0) {
        for (let key of dataObjects.keys()) {
            let { elements, data } = keys.get(key)
            read(Array.from(elements.keys()), data, key);
        }
    }
}

function initElement(el) {
    if (el.hasAttribute('render-json')) {
        // TODO find the json template in the text or attributes
        // if found add the node as an element, if the element has crud attributes also add as the element
        for (let attribute of el.attributes) {
            if (attribute.match(/{{(.*?)}}/)) {
                let value = renderValue(attribute, undefined, attribute.value)
                if (value)
                    attribute.value = value
            }
        }
        if (el.innerHTML.match(/{{(.*?)}}/)) {
            let value = renderValue(el, undefined, el.innerHTML)
            if (value)
                attribute.value = value
        }

        // if (el.textContent.match(/{{(.*?)}}/)) {
        //     let value = renderValue(el, undefined, el.textContent)
        //     if (value)
        //         attribute.value = value
        // }

        // let Data = JSON.parse(match[1]);
        // Data.method = read.object
        // CRUD.send(Data)

    }

    initEvents(el);
    elements.set(el, '')

    // if (el.closest('.template')) return;

    const { isRead } = CRUD.getAttributes(el);

    let data = CRUD.getObject(el);
    if (!data) return

    if (el.getFilter) {
        data.filter = el.getFilter();
        el.setFilter = (filter) => {
            data.filter = filter
            let dataKey = initDataKey(el, data)
            read(el, data, dataKey)
        }
    } else if (data.type === 'object' && data.object) {
        if (typeof data.object === 'object' && !data.object._id.match(/^[0-9a-fA-F]{24}$/))
            return
        else if (typeof data.object === 'string' && !data.object.match(/^[0-9a-fA-F]{24}$/))
            return;
    }

    if (isRead === 'false')
        return;

    return data;
}

function initDataKey(element, data) {
    let dataKey = getDataKey(data)
    if (keys.has(dataKey.string))
        keys.get(dataKey.string).elements.set(element, '')
    else
        keys.set(dataKey.string, { elements: new Map([[element, '']]), data, dataKey });

    elements.set(element, dataKey.string)

    if (element.parentElement) {
        let form = element.parentElement.closest('form')
        if (form) {
            if (!form.save)
                form.save = () => save(form)

            if (!form.getData)
                form.getData = () => getData(form)

            let formObject = forms.get(form)
            if (formObject) {
                formObject.elements.set(element, data)
                if (formObject.types.has(data.type))
                    formObject.types.get(data.type).set(element, data)
                else
                    formObject.types.set(data.type, new Map([[element, data]]));
            } else
                forms.set(form, { elements: new Map([[element, data]]), types: new Map([[data.type, new Map([[element, data]])]]) });
        }
    }

    if (!element.read)
        element.read = () => read(element)
    if (!element.save)
        element.save = () => save(element)

    return dataKey
}

function initEvents(element) {
    if (!elements.has(element)) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
        || element.hasAttribute('contenteditable')
        || element.contenteditable) {
        element.addEventListener('input', function (e) {
            const { object, key, isRealtime, isCrdt } = CRUD.getAttributes(element);
            if (isCrdt == "true" && object && object != 'pending' || isRealtime == "false" || key == "_id") return;
            if (object && e.detail && e.detail.skip == true) return;
            save(element);
        });
    }
}

async function getData(form) {
    let dataArray = []
    let formObject = forms.get(form)
    for (let type of formObject.types.values()) {
        for (let [element, data] of type.entries()) {
            let value = element.getValue()
            console.log(value)
            // group by methods then objectId
            // TODO: if object with same _id and same method 

        }
    }
    return dataArray
}

async function read(element, data, dataKey) {
    if (!dataKey)
        dataKey = elements.get(element)
    if (!data)
        data = keys.get(dataKey).data

    let delayTimer = debounce.get(dataKey.string)
    clearTimeout(delayTimer);
    delayTimer = setTimeout(function () {
        debounce.delete(dataKey.string)
        if (!data.method)
            data.method = 'read' + '.' + data.type
        CRUD.send(data).then((data) => {
            setData(element, data);
        })
    }, 500);
    debounce.set(dataKey.string, delayTimer)
    // if (!dataKey & !data)
    // dataKey = elements.get()
    // return responseData;

}

function setData(element, data, action) {
    if (!element) {
        element = getDataElements(data)
        if (!element.length) return
    }

    if (!(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element]

    let type = data.type
    if (!type && action) {
        type = action.split('.')[0]
    } else if (type == 'key')
        type = 'object'

    for (let el of element) {
        // if rendered in server side skip 
        if (el.hasAttribute('rendered'))
            return el.removeAttribute('rendered');

        if (!data[type])
            continue;

        action = el.getAttribute('actions')
        if (action && ['database', 'array', 'object', 'key'].includes(action)) continue;

        const { key, isRead, isListen, isCrdt } = CRUD.getAttributes(el);
        if (el.getFilter || el.renderValue)
            filterData(el, data, type, key, action)
        else {
            let value = CRUD.getValueFromObject(data[type][0], key);
            if (key) {
                if (!data[type].length) continue;
                if (isRead == "false" || isCrdt == "true") continue;
                if (isListen == "false" && !data.method.startsWith('read')) continue;
            }
            el.setValue(value);
        }
    }
}

function filterData(element, data, type, key, action) {
    if (key) {
        if (!data.type) return
        if (Array.isArray(data[type])) {
            let Data = []
            for (let doc of data[type]) {
                if (doc[key]) {
                    if (Array.isArray(doc[key]))
                        Data.push(...doc[key])
                    else
                        Data.push(doc[key])
                }
            }
            let data = Data
        } else {
            data = { [key]: data[type][key] }
        }
    }

    if (element.getFilter && action && !action.startsWith('read'))
        checkFilters(element, data, type, action)
    else if (element.renderValue)
        element.renderValue(data);
    // render({ element, data, key: type });
    else if (data)
        element.setValue(data)

    const evt = new CustomEvent('fetchedData', { bubbles: true });
    element.dispatchEvent(evt);
}

function checkFilters(element, data, type, action) {
    let Data = element.getData()
    if (!Data) return

    let newData
    if (type) {
        Data = Data[type]
        newData = data[type]
    } else
        newData = data

    let filter = element.getFilter()
    if (filter && filter.query)
        newData = queryData(newData, filter.query)
    if (!newData.length)
        return

    if (Array.isArray(Data)) {
        if (Array.isArray(newData)) {
            for (let i = 0; i < newData.length; i++) {
                checkIndex(element, data, Data, newData[i], type, filter, action)
            }
        } else {
            checkIndex(element, data, Data, newData, type, filter, action)
        }
    } else {
        let primaryKey
        if (type === 'object') {
            primaryKey = '_id';
        } else {
            primaryKey = 'key';
        }

        if (Data[primaryKey] === newData[primaryKey]) {
            Data = dotNotationToObject(newData, Data)
        }
        // render({ source: element, data: Data })
        element.renderValue(data);
    }
}

function checkIndex(element, data, Data, newData, type, filter, action) {
    let index
    if (type === 'object') {
        index = Data.findIndex(obj => obj._id === newData._id);
    } else {
        index = Data.findIndex(obj => obj.name === newData.name);
    }

    if (!data.filter)
        data.filter = {}

    if (action.startsWith('delete')) {
        if (!index && index !== 0)
            return
        data.filter.remove = true
    } else {
        if (!index && index !== 0) {
            data.filter.create = true
            Data.push(newData)
        } else {
            data.filter.update = true
            data.filter.currentIndex = index
            Data[index] = dotNotationToObject(newData, Data[index])
        }

        if (filter && filter.sort) {
            newData.isNewData = true
            Data = sortData(Data, filter.sort)
            index = Data.findIndex(obj => obj.isNewData);
        }

        if (index >= 0) {
            if (data.filter.currentIndex === index)
                delete data.filter.currentIndex
            data.filter.index = index
            // render({ source: element, data })
            element.renderValue(data);
        }

    }
}

function getDataKey(data) {
    let dataKey = {};
    let attributes = ["host", "organization_id", "apikey", "method", "type", "storage", "database", "array", "index", "object", "key", "updateKey", "filter", "upsert", "namespace", "room", "broadcast", "broadcastSender", "broadcastBrowser"];

    for (let attribute of attributes) {
        if (attribute === 'key' && data.type === 'object')
            continue
        let value = data[attribute];
        if (value) {
            if (Array.isArray(value)) {
                dataKey[attribute] = [...value];
                if (typeof value[0] === 'string')
                    dataKey[attribute].sort(); // Sort the values alphabetically
            } else {
                dataKey[attribute] = value;
            }
        }
    }

    const object = Object.fromEntries(Object.entries(dataKey).sort(([a], [b]) => a.localeCompare(b)));
    const string = JSON.stringify(object);

    return { string, object };
}

function getDataElements(data) {
    let element = []
    let matchingKeys = getDataKeys(data)
    for (let i = 0; i < matchingKeys.length; i++) {
        let matchingElements = keys.get(matchingKeys[i])
        if (matchingElements && matchingElements.elements && matchingElements.elements.size)
            element.push(...matchingElements.elements.keys())
    }
    return element
}

function getDataKeys(data) {
    const matchingKeyStrings = [];
    const targetKeys = ["type", "storage", "database", "array", "index", "object", 'filter'];

    for (const [keyString, sortedKey] of keys.entries()) {
        let hasMatch = true;

        for (const key of targetKeys) {
            if (data.hasOwnProperty(key)) {
                if (!sortedKey.data.hasOwnProperty(key)) {
                    hasMatch = false;
                    break;
                }
                if (Array.isArray(sortedKey.data[key]) && Array.isArray(data[key])) {
                    // if key is object check _id
                    const matches = sortedKey.data[key].some(value => {
                        if (key === 'object') {
                            return data[key].some(obj => obj._id === value._id);
                        } else {
                            return data[key].includes(value)
                        }
                    });
                    if (!matches) {
                        hasMatch = false;
                        break;
                    }
                } else if (sortedKey.data[key] !== data[key]) {
                    hasMatch = false;
                    break;
                }
            }
        }

        if (hasMatch) {
            matchingKeyStrings.push(keyString);
        }
    }

    return matchingKeyStrings;
}

async function save(element) {
    if (!element) return;
    let data, value
    if (element.tagName === "FORM") {
        data = element.getData()
    } else {
        let isSave = element.getAttribute('save')
        if (isSave === 'false') return

        let form = element.closest('form');
        if (form)
            return save(form);

        let dataKey = elements.get(element)
        data = keys.get(dataKey).data
        value = element.getValue();
        data[data.type][data.key] = value
        data = [data]
    }

    for (let i = 0; i < data.length; i++) {
        if (data.method.startsWith('create'))
            element.setAttribute(data.type, 'pending');
        else if (data.method.startsWith('update') && data.type == 'object' && typeof value == 'string' && window.CoCreate.crdt && !'crdt') {
            return window.CoCreate.crdt.replaceText({
                array: data.array,
                key: data.key,
                object: data.object._id,
                value
            });
        }

        data = await CRUD.send(data);

        if (data && (!object || object !== data.object[0]._id)) {
            setTypeValue(element, array, data.object[0]._id);
        }

    }

}

function setTypeValue(element, data) {
    if (!data) return;

    let form
    if (element.tagName === "FORM")
        form = element
    else if (element.parentElement)
        form = element.parentElement.closest('form')

    if (!form) {
        if (data.type === 'object') {
            element.setAttribute('object', data.object[0]._id)
        } else {
            element.setAttribute(data.type, data[data.type].name)
        }
    } else {
        let formObject = forms.get(form)
        let elements = formObject.types.get(data.type)

        for (let [el, Data] of elements.entries()) {
            if (data.type === 'object') {
                if (!Data.object || Data.object === 'pending') {
                    Data.object = data.object[0]._id
                    el.setAttribute('object', data.object[0]._id)
                }
            } else if (!Data[data.type]) {
                Data[data.type] = data[data.type].name
                el.setAttribute(data.type, data[data.type].name)
            }
        }

        //     const pass_ids = new Map();

        //     let pass_id = form.getAttribute('pass_id');
        //     if (pass_id) {
        //         // Set pass_ids to pass_ids if array is not set
        //         if (form.getAttribute('array') == array)
        //             pass_ids.set(pass_id, '');
        //     }

        //     let objectId = el.getAttribute('object');
        //     let key = el.getAttribute('key')
        //     // set object and pass_id attributes to the object id if the object id is pending
        //     if (key && (objectId == '' || objectId == 'pending')) {
        //         el.setAttribute('object', id);
        //         // Set the id attribute of the element
        //         if (key == '_id')
        //             el.setValue(id)
        //         let pass_id = el.getAttribute('pass_id');
        //         // Set the pass id to the pass_ids.
        //         if (pass_id) {
        //             pass_ids.set(pass_id, '');
        //         }

        //         if (el.hasAttribute('pass-object')) {
        //             let passObjectId = el.getAttribute('pass-object');
        //             // Set the pass object id if not set.
        //             if (passObjectId == '') {
        //                 el.setAttribute('pass-object', id);
        //                 let pass_id = el.getAttribute('pass_id');
        //                 // Set the pass id to the pass_ids.
        //                 if (pass_id) {
        //                     pass_ids.set(pass_id, '');
        //                 }
        //             }
        //         }

        //         // Set the object attribute of all pass_ids to the object attribute of all pass_ids
        //         if (pass_ids.size > 0) {
        //             for (let key of pass_ids.keys()) {
        //                 let passEls = document.querySelectorAll(`[pass_id="${key}"]`)
        //                 for (let passEl of passEls) {
        //                     // if (passEl.getAttribute('array') == array){
        //                     // Set the object id attribute to the passEl s object if it is not set.
        //                     if (passEl.getAttribute('object') == '') {
        //                         passEl.setAttribute('object', id);
        //                     }
        //                     // }
        //                 }
        //             }
        //         }
        //     }
    }
}

async function remove(element) {
    if (element && !(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element]
    for (let i = 0; i < element.length; i++) {
        let key = elements.get(element[i])
        if (key) {
            let els = keys.get(key).elements
            els.delete(element[i])
            elements.delete(key)
            debounce.delete(element[i])
            // TODO: delete element from forms map
        }
    }
}

function initSocket() {
    const array = ['create', 'update', 'delete'];
    const attributes = ["storage", "database", "array", "index", "object", 'filter'];

    for (let i = 0; i < array.length; i++) {
        for (let j = 0; j < attributes.length; j++) {
            const action = array[i] + '.' + attributes[j];

            CRUD.listen(action, function (data) {
                setData(null, data, action);
            });
        }
    }

    CRUD.listen('sync', function (data) {
        setData(null, data, action);
    });

}

Observer.init({
    name: 'render',
    observe: ['addedNodes'],
    target: '[render-clone]',
    callback: function (mutation) {
        let renderedNode = CoCreate.render.renderedNodes.get(mutation.target)
        if (!renderedNode) return

        if (!mutation.movedFrom) return
        let draggedEl = mutation.target
        let draggedFrom = mutation.movedFrom.parentElement
        let droppedEl = mutation.target.nextElementSibling || mutation.target.previousElementSibling
        let droppedIn = mutation.parentElement

        if (!draggedFrom || !droppedIn) return
        dndCrud(draggedEl, draggedFrom, droppedEl, droppedIn)
    }
})

// TODO: has the potential to work on most of the crud elements specifically if the value is an object or an array
function dndCrud(draggedEl, draggedFrom, droppedEl, droppedIn) {
    let from = dndCrudData(draggedEl, draggedFrom, 'remove')
    let to = dndCrudData(droppedEl, droppedIn, 'add')

    if (from && to && !draggedFrom.isSameNode(droppedIn)) {
        let element = getDataElements(from.data)
        if (!element.length) return

        let match = element.find(obj => obj === droppedIn);
        if (!match) {
            if (from.keyPath.includes('.')) {
                let test = { [from.keyPath]: undefined }

                from.newData = dotNotationToObject(test, from.newData)
                dndCrudSend(from.newData, 'update')
            } else {
                const index = from.keyPath.match(/\[(\d+)\]/)
                let removeData = from.newData[from.newData.type].splice(index, 1)[0];
                if (removeData) {
                    removeData.type = from.newData.type
                    removeData[removeData.type] = removeData
                    dndCrudSend(removeData, 'delete')
                }

                if (from.newData[from.newData.type].length)
                    dndCrudSend(from.newData, 'update')

            }
        }
    }

    if (to)
        dndCrudSend(to.newData, 'update')

}

function dndCrudData(element, parent, operator) {
    if (!elements.has(parent)) return
    let data = parent.getData()
    let newData = CRUD.getObject(parent)

    let { Data, sortName, sortDirection, keyPath, clones, index } = dndNewData(element, data)
    newData[newData.type] = []

    if (sortName) {
        for (let i = 0; i < clones.length; i++) {
            if (i > index) {
                let previousData = data[data.type][index]
                if (operator === 'add')
                    Data[sortName] = i + 1
                else if (operator === 'remove')
                    Data[sortName] = i - 1

                newData[newData.type].push({ ...previousData, ...Data })
            }
        }
    } else {
        newData[newData.type] = [{ ...data[data.type][index], ...Data }]
    }

    return { data, newData, keyPath, clones, index }
}

function dndNewData(element, data) {
    let Data = {}
    let query = data.filter.query
    if (query && query.length) {
        for (let i = 0; i < query.length; i++) {
            if (query.operator === "$eq")
                Data[query.key] = query.value
            if (query.operator === "$ne")
                Data[query.key] = query.value
        }
    }

    let sortName, sortDirection
    let sort = data.filter.sort
    if (sort && sort.length) {
        // for (let i = 0; i < sort.length; i++) {
        for (let i = sort.length - 1; i >= 0; i--) {
            if (typeof data[sort.key] === 'number') {
                sortName = sort.key
                sortDirection = sort.direction
                break
            }
        }
    }

    let keyPath, clonesMap, clones, index

    let renderedNode = CoCreate.render.renderedNodes.get(element)
    if (renderedNode) {
        keyPath = renderedNode.keyPath
        clonesMap = renderedNode.template.clones
        clones = Array.from(clonesMap.values());
        index = clones.indexOf(element);
    }

    return { Data, sortName, sortDirection, keyPath, clones, index }

}

function dndCrudSend(data, crudType) {
    if (CRUD) {
        let action = data.type;
        action = action.charAt(0).toUpperCase() + action.slice(1);
        CRUD[crudType + action](data)
    } else
        console.log('dnd reordered data set as crud is unavailable')
}

// crud delete selected elements can be done with click-selector="" to target elements with a specified selector
// ex. [actions*='save'][selected] which could be used to trigger a click event on the save action
// in a form with crud and delete attribute causing each selected item to be deleted

Observer.init({
    name: 'CoCreateElementsChildList',
    observe: ['childList'],
    target: selector,
    callback: function (mutation) {
        init(mutation.addedNodes);
    }
});

Observer.init({
    name: 'CoCreateElementsRemovedNodes',
    observe: ['removedNodes'],
    target: selector,
    callback: function (mutation) {
        if (mutation.target.parentElement) return
        remove(mutation.target)
    }
});

Observer.init({
    name: 'CoCreateElementsAttributes',
    observe: ['attributes'],
    attributeName: CRUD.getAttributeNames(['storage', 'database', 'array', 'object', 'key']),
    target: selector,
    callback: function (mutation) {
        remove(mutation.target)
        init([mutation.target]);
    }
});

Actions.init({
    name: "save",
    endEvent: "saved",
    callback: (action) => {
        const form = action.element.closest("form");
        save(form);
    }
});

init();

export default { init, read, save, getData, reset, elements, keys, forms, debounce };
