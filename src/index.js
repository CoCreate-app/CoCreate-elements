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

const selector = "[storage], [database], [array], [array]:not(cocreate-select, link)";
const elements = new Map();
const keys = new Map();
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
        if (elements.has(element[i]))
            continue

        let data = initElement(element[i]);
        if (data) {
            let dataKey = getDataKey(data)
            if (keys.has(dataKey.string))
                keys.get(dataKey.string).elements.set(element[i], '')
            else
                keys.set(dataKey.string, { elements: new Map([[element[i], '']]), data, dataKey });
            elements.set(element[i], dataKey.string)
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
    initEvents(el);
    elements.set(el, '')

    // if (el.closest('.template')) return;

    const { array, object, isRead, key } = CRUD.getAttributes(el);

    let data = CRUD.getObject(el);

    if (el.getFilter) {
        el.setFilter = (filter) => {
            data.filter = filter
            let dataKey = getDataKey(data)
            if (keys.has(dataKey.string))
                keys.get(dataKey.string).elements.set(el, '')
            else
                keys.set(dataKey.string, { elements: new Map([[el, '']]), data, dataKey });
            elements.set(el, dataKey.string)

            // remove(el)
            // init([el]);
            read(el, data, dataKey)
        }
        data.filter = el.getFilter();
    } else {
        // TODO: Update to support other crudTypes
        if (!array || !key) return;

        if (object)
            if (!object.match(/^[0-9a-fA-F]{24}$/)) return;
        if (!CRUD.checkValue(array) || !CRUD.checkValue(key)) return;
    }

    if (isRead == 'false') return;
    if (!object && !data.filter) return;

    return data;
}

function initEvents(element) {
    if (!elements.has(element)) {
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
}

async function read(element, data, dataKey) {
    let delayTimer = debounce.get(dataKey.string)
    clearTimeout(delayTimer);
    delayTimer = setTimeout(function () {
        debounce.delete(dataKey.string)
        if (data.type === 'key')
            data.type = 'object'
        if (!data.method)
            data.method = 'read' + '.' + data.type
        CRUD.send(data).then((data) => {
            setData(element, data);
        })
    }, 500);
    debounce.set(dataKey.string, delayTimer)
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
        // type = action.match(/[A-Z][a-z]+/g);
        // type = type[0].toLowerCase()

    } else if (type == 'key')
        type = 'object'

    for (let el of element) {
        // if rendered in server side skip 
        if (el.hasAttribute('rendered')) {
            el.removeAttribute('rendered');
            return;
        }

        if (!data[type])
            continue;

        const { key, isRead, isUpdate, isCrdt } = CRUD.getAttributes(el);
        // TODO: Update to support other crudTypes
        if (key) {
            if (!data[type].length) continue;
            if (el.hasAttribute('actions')) continue;
            if (isRead == "false" || isUpdate == "false" || isCrdt == "true") continue;

            let value = CRUD.getValueFromObject(data[type][0], key);
            // if (el.hasAttribute('component') || el.hasAttribute('plugin'))
            //     continue;

            el.setValue(value);
        } else {
            filterData(el, data, type, action)
        }
    }
}

function filterData(element, data, type, action) {
    if (!element)
        return;

    let key = element.getAttribute('key');

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

    if (element.getFilter && action && !action.startsWith('read')) {
        checkFilters(element, data, type, action)
    } else if (data)
        element.renderValue(data);

    // render({ element, data, key: type });
    const evt = new CustomEvent('fetchedData', { bubbles: true });
    element.dispatchEvent(evt);
}

function checkFilters(element, data, type, action) {
    let Data = element.getValue()
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
    let attributes = ["storage", "database", "array", "index", "object", 'filter'];

    for (let attribute of attributes) {
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
    dataKey = JSON.stringify(object);

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
    const targetKeys = ["storage", "database", "array", "index", "object", 'filter'];

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
    let value = element.getValue();
    CRUD.save(element, value);
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
    let data = parent.getValue()
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

//TODO: needs to updated in order to match new system
function deleteObjectsAction(btn) {
    // selector to point to crud item


    // Could work on any crud type to delete an item or keyPath
    // dndCrud(draggedEl, draggedFrom, droppedEl, droppedIn)

    const array = btn.getAttribute('array');
    if (checkValue(array)) {
        const template_id = btn.getAttribute('template_id');
        if (!template_id) return;

        let _ids = []
        const selectedEls = Object.querySelectorAll(`.selected[templateid="${template_id}"]`);
        for (let i = 0; i < selectedEls.length; i++) {
            const _id = selectedEls[i].getAttribute('object');
            if (checkValue(_id))
                _ids.push({ _id })
        }

        if (_ids.length > 0 && crud) {
            CRUD.send({
                method: 'delete.object',
                array,
                object: _ids
            }).then(() => {
                document.dispatchEvent(new CustomEvent('deletedObjects', {
                    detail: {}
                }));
            })
        }

    }
}

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

Actions.init(
    {
        name: "saveHtml",
        endEvent: "changed-element",
        callback: (data) => {
            let form = data.element.closet('form');
            save(form);
        },
    },
    {
        name: "deleteObjects",
        endEvent: "deletedObjects",
        callback: (data) => {
            __deleteObjectsAction(data.element);
        }
    }
);

init();

export default { init, save, elements, keys, debounce };
