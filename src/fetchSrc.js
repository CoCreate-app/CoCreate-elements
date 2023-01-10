import observer from '@cocreate/observer';

const selector = '[src]:not(img, video, script, input, iframe, frame, link)'
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
        if (src) {
            try {
                let response = await fetch(src); 
                let text = await response.text();
                if (text) {
                    element.setValue(text);
                    initializing.delete(element)
                }
            } catch (err) {
                console.log('FetchSrc error:' + err);
            }
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

