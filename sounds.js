const speakButton = document.getElementById("speakButton");
const stopButton = document.getElementById("pauseButton");
const statusText = document.getElementById("speechStatus");

const restaurantName = "Green Table";

let currentSpeech = null;

function readMenu() {
    window.speechSynthesis.cancel();

    const welcomeText = `
        Welcome to ${restaurantName} restaurant!
        What would you like to eat today?
        Let me introduce our signature dishes.
    `;

    const mainDishes = document.querySelector(
        'section[aria-labelledby="mains"]'
    );

    const drinks = document.querySelector(
        'section[aria-labelledby="drinks"]'
    );

    const mainText = mainDishes ? mainDishes.innerText : "";
    const drinksText = drinks ? drinks.innerText : "";

    const fullText = `
        ${welcomeText}

        ${mainText}

        Would you like something to drink?
        ${drinksText}

        Please let your server know what you would like to order.
        If you have any allergies or dietary requirements,
        please ask a staff member before ordering.
        We hope you enjoy your meal!
    `;

    currentSpeech = new SpeechSynthesisUtterance(fullText);
    currentSpeech.lang = "en-US";
    currentSpeech.rate = 0.9;
    currentSpeech.volume = 1;

    currentSpeech.onstart = function () {
        statusText.textContent = "Reading the menu.";
    };

    currentSpeech.onend = function () {
        statusText.textContent =
            "Reading complete. Select Read Menu to listen again.";
    };

    currentSpeech.onerror = function (event) {
        if (
            event.error === "canceled" ||
            event.error === "interrupted"
        ) {
            return;
        }

        statusText.textContent =
            "Select Read Menu to start listening.";
    };

    window.speechSynthesis.speak(currentSpeech);
}

if ("speechSynthesis" in window) {
    speakButton.addEventListener("click", readMenu);

    stopButton.addEventListener("click", function () {
        const synth = window.speechSynthesis;

        if (synth.paused) {
            synth.resume();
            stopButton.textContent = "Pause Reading";
            statusText.textContent = "Reading resumed.";
        } else if (synth.speaking) {
            synth.pause();
            stopButton.textContent = "Resume Reading";
            statusText.textContent = "Reading paused.";
        }
    });

    window.addEventListener("load", function () {
        statusText.textContent =
            "Select Read Menu if reading does not start automatically.";

        readMenu();
    });


    window.addEventListener("pagehide", function () {
        window.speechSynthesis.cancel();
    });
} else {
    statusText.textContent =
        "Speech is unavailable. Please use your device's screen reader.";

    speakButton.disabled = true;
    stopButton.disabled = true;
}