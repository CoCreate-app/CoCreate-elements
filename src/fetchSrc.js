import observer from '@cocreate/observer';

const selector = '[src]:not(img, video, script, input, iframe, frame)'
const initializing = new Map();


function init() {
    var elements = document.querySelectorAll(selector);
    initElements(elements);
};

function initElements(elements) {
    for (let element of elements)
        initElement(element);
};

async function initElement(element) {
    let src = element.getAttribute('src');
    let initialize = initializing.get(element)
    if (!initialize || initialize.src != src){
        initializing.set(element, {src});
        if (src) 
            try {
                let response = await fetch(src); // Gets a promise
                let text = await response.text(); // Replaces body with response
                if (text){
                    element.innerHTML = text; // Replaces body with response
                    initializing.delete(el)
                }
            } catch (err) {
                console.log('Fetch error:' + err); // Error handling
            }
    }   
};

observer.init({
	name: 'CoCreateSrc',
	observe: ['addedNodes'],
	target: selector,
	callback: function(mutation) {
		initElement(mutation.target);
	}
});

observer.init({
	name: 'CoCreateSrcAttributes',
	observe: ['attributes'],
	attributeName: ['src'],
	target: selector,
	callback: function(mutation) {
		initElement(mutation.target);
	}
});

init()

