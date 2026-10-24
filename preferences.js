(() => {
  const voiceButton = document.getElementById("voiceButton");
  const voiceLabel = document.getElementById("voiceLabel");
  const input = document.getElementById("preferenceInput");
  const form = document.getElementById("preferenceForm");
  const status = document.getElementById("assistantStatus");
  const results = document.getElementById("recommendations");

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!voiceButton || !voiceLabel || !input || !form || !status || !results) {
    console.error("Menu assistant: required HTML elements are missing.");
    return;
  }

  // API keys stay on the server.
  const API_URL = "/api/recommend";
  const history = [];

  let busy = false;
  let requestController = null;
  let utterance = null;
  let state = "idle";
  let transcript = "";
  let stopRequested = false;
  let hadError = false;
  let discarded = false;
  let heldPointer = null;

  results.tabIndex = -1;
  status.setAttribute("role", "status");
  status.setAttribute("aria-atomic", "true");
  voiceButton.style.touchAction = "none";

  function stopSpeaking() {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) return;

    stopSpeaking();

    utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.9;

    window.speechSynthesis.speak(utterance);
  }

  function announce(text, readAloud = true) {
    status.textContent = text;

    if (readAloud) {
      speak(text);
    }
  }

  function addParagraph(parent, text) {
    const p = document.createElement("p");
    p.textContent = text;
    parent.appendChild(p);
  }

  function updateButton() {
    voiceButton.disabled = busy || !SpeechRecognition;

    voiceButton.setAttribute(
      "aria-pressed",
      String(state !== "idle")
    );

    if (busy) {
      voiceLabel.textContent = "Finding dishes…";
    } else if (!SpeechRecognition) {
      voiceLabel.textContent = "Voice unavailable";
    } else if (state === "starting") {
      voiceLabel.textContent = "Starting…";
    } else if (state === "listening") {
      voiceLabel.textContent = "Listening…";
    } else if (state === "processing") {
      voiceLabel.textContent = "Processing…";
    } else {
      voiceLabel.textContent = "Hold to speak";
    }
  }

  function setBusy(value) {
    busy = value;
    results.setAttribute("aria-busy", String(value));

    form.querySelectorAll(
      'button[type="submit"], input[type="submit"]'
    ).forEach(button => {
      button.disabled = value;
    });

    input.readOnly = value;
    updateButton();
  }

  function validateResult(data) {
    return (
      data &&
      typeof data.message === "string" &&
      typeof data.followUp === "string" &&
      Array.isArray(data.matches) &&
      data.matches.every(dish =>
        dish &&
        typeof dish.id === "string" &&
        typeof dish.name === "string" &&
        typeof dish.description === "string" &&
        typeof dish.price === "number" &&
        Number.isFinite(dish.price) &&
        typeof dish.currency === "string" &&
        typeof dish.reason === "string" &&
        Array.isArray(dish.ingredients) &&
        dish.ingredients.every(
          ingredient => typeof ingredient === "string"
        )
      )
    );
  }

  function renderRecommendations(data) {
    const fragment = document.createDocumentFragment();
    const heading = document.createElement("h2");

    heading.textContent = data.matches.length
      ? "Your recommended dishes"
      : "Menu assistant";

    fragment.appendChild(heading);

    if (data.message) {
      addParagraph(fragment, data.message);
    }

    const spoken = [data.message];

    if (data.matches.length) {
      addParagraph(
        fragment,
        "Ordered by preference match, not by ratings or quality."
      );
    }

    data.matches.forEach((dish, index) => {
      const article = document.createElement("article");
      article.className = "dish";

      const title = document.createElement("h3");
      title.textContent = `${index + 1}. ${dish.name}`;
      article.appendChild(title);

      const price =
        `Price: ${dish.price.toFixed(2)} ${dish.currency}`;

      const priceElement = document.createElement("p");
      priceElement.className = "price";
      priceElement.textContent = price;
      article.appendChild(priceElement);

      addParagraph(article, dish.description);

      if (dish.ingredients.length) {
        addParagraph(
          article,
          "Listed ingredients: " +
            dish.ingredients.join(", ") +
            "."
        );
      }

      addParagraph(
        article,
        "Why this matches: " + dish.reason
      );

      fragment.appendChild(article);

      spoken.push(
        `${index + 1}. ${dish.name}. ${price}. ` +
        `${dish.description} Why this matches: ${dish.reason}`
      );
    });

    if (data.matches.length) {
      const notice =
        "Please confirm ingredients and allergens with restaurant staff.";

      addParagraph(fragment, notice);
      spoken.push(notice);
    }

    if (data.followUp) {
      addParagraph(fragment, data.followUp);
      spoken.push(data.followUp);
    }

    results.replaceChildren(fragment);

    status.textContent = data.matches.length
      ? `${data.matches.length} recommendation(s) ready.`
      : "Response ready.";

    // Automatically read the current recommendations.
    speak(spoken.filter(Boolean).join(" "));
  }

  async function filterMenu(preference) {
    if (busy) return;

    stopSpeaking();
    setBusy(true);
    status.textContent = "Finding dishes for you…";

    const controller = new AbortController();
    requestController = controller;

    const timeout = window.setTimeout(
      () => controller.abort(),
      60000
    );

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: preference,
          history
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const message =
          response.status === 429
            ? "The AI usage limit was reached. Please try again later."
            : response.status === 400
            ? "Please enter a preference of up to 2000 characters."
            : "The menu assistant is unavailable. Please try again.";

        throw new Error(message);
      }

      if (
        !response.headers.get("content-type")
          ?.includes("application/json")
      ) {
        throw new Error(
          "The webpage is not connected to the menu API. " +
          "Open it through the Node server."
        );
      }

      const data = await response.json();

      if (!validateResult(data)) {
        throw new Error(
          "The assistant returned an unexpected response. Please try again."
        );
      }

      renderRecommendations(data);

      // Remember earlier recommendations for follow-up questions.
      const summary = JSON.stringify({
        message: data.message,
        matches: data.matches.map(dish => ({
          id: dish.id,
          name: dish.name,
          price: dish.price,
          currency: dish.currency
        })),
        followUp: data.followUp
      }).slice(0, 5000);

      history.push(
        {
          role: "user",
          content: preference
        },
        {
          role: "assistant",
          content: summary
        }
      );

      // Keep the latest six successful exchanges.
      if (history.length > 12) {
        history.splice(0, history.length - 12);
      }
    } catch (error) {
      const message =
        error.name === "AbortError"
          ? "The request timed out. Please try again."
          : error instanceof TypeError
          ? "Cannot reach the menu server. Check that node server.mjs is running."
          : error.message;

      announce(message);
    } finally {
      window.clearTimeout(timeout);

      if (requestController === controller) {
        requestController = null;
      }

      setBusy(false);
    }
  }

  // Typed preferences.
  form.addEventListener("submit", event => {
    event.preventDefault();

    if (busy) return;

    if (state !== "idle") {
      announce(
        "Please finish voice input before searching.",
        false
      );
      return;
    }

    const preference = input.value.trim();

    if (preference.length > 2000) {
      announce(
        "Please keep your preference under 2000 characters."
      );
      return;
    }

    if (preference) {
      filterMenu(preference);
    }
  });

  window.addEventListener("pagehide", () => {
    requestController?.abort();
    stopSpeaking();
  });

  // Typed input still works without speech recognition.
  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    voiceLabel.textContent = "Voice unavailable";

    announce(
      "Voice input is unavailable in this browser. " +
      "Please type your preference.",
      false
    );

    return;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;

  function startListening() {
    if (state !== "idle" || busy) return;

    stopSpeaking();

    transcript = "";
    stopRequested = false;
    hadError = false;
    discarded = false;
    state = "starting";

    updateButton();

    announce(
      "Starting microphone. Allow microphone access if prompted.",
      false
    );

    try {
      recognition.start();
    } catch (error) {
      state = "idle";
      updateButton();

      announce(
        "Could not start voice input. Please try again or type.",
        false
      );
    }
  }

  function finishListening() {
    if (state === "starting") {
      stopRequested = true;
      return;
    }

    if (state !== "listening") return;

    state = "processing";
    updateButton();

    announce("Processing your preference…", false);
    recognition.stop();
  }

  recognition.onstart = () => {
    state = "listening";
    updateButton();

    announce(
      "Listening. Say what you would like to eat.",
      false
    );

    if (stopRequested) {
      finishListening();
    }
  };

  recognition.onresult = event => {
    const finalParts = [];
    const previewParts = [];

    for (let i = 0; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;

      previewParts.push(text);

      if (event.results[i].isFinal) {
        finalParts.push(text);
      }
    }

    input.value = previewParts.join(" ");
    transcript = finalParts.join(" ").trim();
  };

  recognition.onerror = event => {
    hadError = true;

    if (discarded) return;

    const message =
      event.error === "not-allowed"
        ? "Microphone permission was denied. Please allow access or type."
        : event.error === "no-speech"
        ? "No speech was detected. Please try again or type."
        : "Voice recognition failed. Please try again or type.";

    announce(message, false);
  };

  recognition.onend = () => {
    state = "idle";
    updateButton();

    if (discarded || hadError) return;

    if (!transcript) {
      announce(
        "I did not catch that. Please hold the button and try again.",
        false
      );
      return;
    }

    input.value = transcript;

    if (transcript.length > 2000) {
      announce(
        "Please keep your preference under 2000 characters."
      );
      return;
    }

    filterMenu(transcript);
  };

  // Mouse and touch: hold to speak, release to submit.
  voiceButton.addEventListener("pointerdown", event => {
    if (
      !event.isPrimary ||
      event.button !== 0 ||
      busy ||
      state !== "idle"
    ) {
      return;
    }

    event.preventDefault();
    voiceButton.focus();

    heldPointer = event.pointerId;
    voiceButton.setPointerCapture(event.pointerId);

    startListening();
  });

  voiceButton.addEventListener("pointerup", event => {
    if (event.pointerId !== heldPointer) return;

    heldPointer = null;
    finishListening();
  });

  voiceButton.addEventListener("pointercancel", () => {
    heldPointer = null;
    discarded = true;

    if (state !== "idle") {
      recognition.abort();

      announce(
        "Voice input canceled. Please try again.",
        false
      );
    }
  });

  // Keyboard and screen reader: activate to start/stop.
  voiceButton.addEventListener("click", event => {
    if (event.detail !== 0) return;

    if (state === "idle") {
      startListening();
    } else {
      finishListening();
    }
  });

  voiceButton.addEventListener("contextmenu", event => {
    event.preventDefault();
  });

  window.addEventListener("pagehide", () => {
    discarded = true;
    recognition.abort();
  });
})();