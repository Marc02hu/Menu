const speakButton = document.getElementById("speakButton");
const stopButton = document.getElementById("stopButton");
const statusText = document.getElementById("speechStatus");

if ("speechSynthesis" in window) {
    speakButton.addEventListener("click", function () {
        window.speechSynthesis.cancel();

        // Read the menu sections without reading the buttons.
        const sections = document.querySelectorAll("#content section");
        const menuText = Array.from(sections)
            .map(section => section.innerText)
            .join("\n");

        const speech = new SpeechSynthesisUtterance(menuText);
        speech.lang = "en-CA";
        speech.rate = 0.9;

        speech.onstart = function () {
            statusText.textContent = "Reading the menu.";
        };

        speech.onend = function () {
            statusText.textContent = "Reading complete.";
        };

        speech.onerror = function (event) {
            if (event.error !== "interrupted" &&
                event.error !== "canceled") {
                statusText.textContent = "Unable to read the menu.";
            }
        };

        window.speechSynthesis.speak(speech);
    });

    stopButton.addEventListener("click", function () {
        window.speechSynthesis.cancel();
        statusText.textContent = "Reading stopped.";
    });
} else {
    statusText.textContent = "This browser does not support speech.";
    speakButton.disabled = true;
    stopButton.disabled = true;
}