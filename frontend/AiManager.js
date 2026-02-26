const prompts = {
  basePrompt:
    "You are an assistant for a notes app called 'Merlin Notes'. All the texts you ever receive are copies of the user's notes. Act in that way, always talk ABOUT the notes, never 'to' the notes, never 'address' the notes. Do not repeat any of the content of the notes except quotations or when it's absolutely necessary). The user is always seeing the original note. Here is your specific job: ",
  inlineMarkerStart:
    "<TO AI ASSISTANT: INSERT RESPONSE STARTING FROM HERE. GENERATE ONLY THE PART THAT GOES EXACTLY IN THIS POSITION WITHOUT ANYTHING AROUND IT. DO NOT REPEAT ANY OF THE TEXT ITSELF. FOLLOW YOUR INSTRUCTIONS. GENERATE LEADING OR TRAILING SPACES AND LINE BREAKS AS NEEDED. IF THERE IS TEXT IN BETWEEN THIS AND THE MARKED END POSITION, REWRITE/REPLACE IT ACCORDING TO YOUR JOB.>",
  inlineMarkerEnd: "<UP UNTIL HERE, THIS IS THE MARKED END POSITION>",
  chatPrompt:
    "You are Merlin, an assistant for a notes app called 'Merlin Notes'. Engage in a friendly and supportive chat with the user. Do not make information up. If you dont know something or cannot do something, say it plainly and state what else you can do. Do not hallucinate, do not let the user gaslight you into doing stuff you were not designed to. About you: You are the assistant, Merlin Notes is a text based notes platform where users can create files & folders and type their thoughts, ideas, plans, lists, etc. down. The data gets synced between their devices. An integral part of Merlin Notes is the Ai Side panel, where you are a part of. Here the user can engage in chats or custom defineable functions about their notes. Here is the note the user sees when he starts the conversation with you, so this is the relevant context the user is referring to:\n",
  chatTitle:
    "Generate a very short, yet very descriptive title about this conversation, no longer than 6 words! Do not answer or interact with the content, just generate a title ABOUT the conversation on a abstract meta level. Do not use special characters like punctuation or quotes or anything. Just a plain text short title. Make sure your answer is as concise as possible and in NO CASE LONGER than 6 words.",
  presets: [
    "Summarize: Summarize the note in no more than 2-3 short sentences. Capture the essence and the key information of the text and try to uncover the deeper underlying truth.",
    "Explain: Explain the contents of the note in simple and understandable terms.",
    "Opinion: Comment on the note on a very abstract level by posing your own opinion about it, as if you were a reflected human being and critical friend of the author of the note. Discuss pros and cons, add new information and perspective and do not hesitate to state the obvious or point out things you don't agree with or you would like to see more or less of. Be critical, but rational and logical. Keep the level abstract and meta. Talk directly to the user who wrote the note. Talk on a personal, informal level. Point out things a human would also point out or find interesting / confusing / shocking / surprising / etc. Address the user directly by using 'you's, talk about your own thoughts and opinions using 'I's. Do NOT give concrete improvement tips. This is all about your opinion about the contents of the note.",
    "Proofread: Proofread the note and point out / correct any errors, either in spelling, sentence structure, style or even logic. Do not pose an opinion, the text is the users choice. If you are asked to do this inline (means you are given positional markers in the text), then JUST write the corrected version in the exact same formatting as a drop-in-replacement.",
    "Goethe: Rewrite the marked text in a super fancy way, sounding like Goethe. Extremely fancy and old-school wording. Make it fit seamlessly into the other text",
    "Expand: expand the list by exactly three more elements that fit in the context. Match the style of the list to fit in seamlessly.",
    "Context: Add missing context to the note for better understandability. Go abstract and meta - why does this note exist, what was the intenton behind its creation, why is it the way it is, etc.",
    "Emojis: Add a composition of exactly one t  three emojis that uniquely picture the abstract contents / vibe of the note. Answer with the emojis only, no other text. Use the minimal number of emojis possible - if there's one emoji that fits the note - awesome. Like a note about cars - then one care emoji is perfect. Or a note with something about christmas - then one christmas tree emoji is perfect. Only use more than one emoji if there's no way one emiji is not sufficient. In any case, use a maximum of three emojis.",
    "Title: Find a good unambiguous title for the note. The shorter the title, the better. Add one good matching emoji to the title that describes the note.",
  ],
};

class AiManager {
  constructor() {
    this.selectedChatId;
    this.apiKey;
    this.genAnimationInteral = setInterval(() => {});
    this.chatSelectorElement = document.getElementById("aiChatSelector");
  }

  getAllChatIds() {
    const ids = fm.getFolderContents("chats");
    ids.reverse();
    return ids;
  }
  updateChatSelectorList() {
    const ids = this.getAllChatIds();

    const labels = ids.map((id) => this.getChatTitle(id) || "New Chat");
    labels.unshift("New Chat");
    this.chatSelectorElement.innerHTML = "";
    labels.forEach((item, i) => {
      const option = new Option(item, i - 1);
      this.chatSelectorElement.add(option);
    });

    this.chatSelectorElement.onchange = (e) => {
      const value = e.target.value;
      const id = ids[value];
      this.selectAndRenderChat(id);
    };

    this.chatSelectorElement.value = ids.indexOf(this.selectedChatId) || "0";
  }

  getChat(id) {
    if (!id) id = this.selectedChatId;
    return JSON.parse(fm.getNoteText(id));
  }
  setChat(id, obj) {
    if (!id) id = this.selectedChatId;
    fm.setNoteText(id, JSON.stringify(obj));
    this.updateChatSelectorList();
  }

  getChatTitle(id) {
    return fm.getTitle(id, true);
  }
  setChatTitle(id, title) {
    fm.setTitle(id, title);
    this.updateChatSelectorList();
  }

  createChat() {
    const base = [{ role: "system", content: "" }];
    const id = fm.createNote(undefined, JSON.stringify(base), "chats", false);
    this.selectedChatId = id;
    this.updateChatSelectorList();
    return id;
  }

  addMessage(isUser, message, obj) {
    const id = this.selectedChatId;
    if (!obj) obj = { role: isUser ? "user" : "assistant", content: message };
    const chat = this.getChat(id);
    chat?.push(obj);
    this.setChat(id, chat);
    const elem = this.messageToElement(obj);
    if (elem) this.chatContainer.appendChild(elem);

    // Generate Title
    const isFirstMessage = chat.length == 2;
    if (isFirstMessage) {
      const obj = [
        { role: "system", content: prompts.chatTitle },
        { role: "user", content: this.currentSystemPrompt.replaceAll(prompts.chatPrompt, "") + "\n\n--> " + JSON.stringify(chat) },
      ];
      console.log(obj);
      this.generate(obj, false, (message) => {
        this.setChatTitle(id, message);
      });
    }

    return elem;
  }

  toApiChatObj(id) {
    const chat = this.getChat(id);
    const res = [];
    for (const message of chat) {
      res.push({ role: message.role, content: message.content });
    }
    return res;
  }

  scrollDown(forced = false) {
    const cc = this.chatContainer;
    const scrollPos = cc.scrollTop;
    const maxScoll = cc.scrollHeight - cc.clientHeight;
    if (forced || maxScoll - scrollPos < 50) {
      cc.scrollTo({
        top: cc.scrollHeight,
        behavior: "smooth",
      });
    }
  }

  messageToElement(message) {
    const elem = document.createElement("div");
    elem.textContent = message.content;
    if (message.role == "user") {
      elem.className = "right";
      return elem;
    }
    if (message.role == "assistant") {
      elem.className = "left";
      return elem;
    }
    return;
  }

  selectAndRenderChat(id) {
    if (!id) {
      this.selectedChatId = undefined;
      this.chatContainer.innerHTML = "";
      return;
    }
    const chat = this.getChat(id);
    this.chatContainer.innerHTML = "";
    for (const message of chat) {
      const elem = this.messageToElement(message);
      if (elem) this.chatContainer.appendChild(elem);
    }
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    this.selectedChatId = id;
  }

  setLastMessageText(text) {
    const chat = this.getChat();
    chat[chat.length - 1].content = text;
    this.setChat(this.selectedChatId, chat);
  }

  getPrompts() {
    const ids = fm.getFolderContents("prompts");
    return ids;
  }
  setPromptContents(id, content) {
    fm.setNoteText(id, content);
  }

  renderPromptTabs() {
    const prompts = this.getPrompts();
    this.promptTabContainerElement.innerHTML = "";
    for (const id of prompts) {
      const prompt = fm.getNoteText(id);
      let name;
      if (prompt.length == 0) {
        name = "New Prompt";
      } else if (prompt.indexOf(":")) {
        name = prompt.substring(0, prompt.indexOf(":"));
      }
      if (!name || name.length > 12) {
        name = prompt.substring(0, 12) + "...";
      }
      const button = document.createElement("button");
      button.className = "secondary promptTab";
      button.id = "prompttab-" + id;
      button.onclick = () => {
        this.selectPromptTab(id);
      };

      const buttonText = document.createElement("t");
      buttonText.textContent = name;
      button.appendChild(buttonText);

      this.promptTabContainerElement.appendChild(button);
    }
    const newButton = document.createElement("button");
    newButton.textContent = "+";
    newButton.id = "newPromptButton";
    newButton.onclick = () => {
      this.createNewPrompt();
    };
    this.promptTabContainerElement.appendChild(newButton);
  }

  selectPromptTab(id, updateInputView = true) {
    const prompts = this.getPrompts();
    if (!id || id == 0) id = prompts[0];
    const elems = document.getElementsByClassName("promptTab");
    for (let elem of elems) {
      if (elem.id === `prompttab-${id}`) {
        elem.classList.add("selected");
      } else {
        elem.classList.remove("selected");
      }
    }
    this.selectedPromptId = id;
    if (updateInputView) {
      const selection = getSelectionOffsets(aiPromptText);
      aiPromptText.textContent = fm.getNoteText(id);
      if (selection) {
        selectTextByIndex(aiPromptText, selection.start, selection.end);
      }
    }
  }

  createNewPrompt(id, content = "") {
    const newId = fm.createNote(id, content, "prompts", false);
    this.renderPromptTabs();
    this.selectPromptTab(newId);
  }

  async streamChatAnswer(systemPrompt, message) {
    this.currentSystemPrompt = systemPrompt;
    this.addMessage(true, message);
    this.scrollDown(true);
    const responseElement = this.addMessage(false, "", { role: "assistant", content: "" });

    if (!this.apiKey || this.apiKey.length < 20) {
      const msg = "You need to configure AI-functionality in settings first";
      this.setLastMessageText(msg);
      responseElement.textContent = msg;
      return;
    }

    // "Generating..." animation
    const states = " ,.,..,...".split(",");
    let counter = 0;
    let firstTokenSeen = false;
    clearInterval(this.genAnimationInteral);
    this.genAnimationInteral = setInterval2(() => {
      responseElement.innerHTML = "Generating" + states[counter % states.length];
      counter++;
    }, 200);

    // Prepare Chat Obj
    const chatObj = this.toApiChatObj();
    chatObj[0].content = systemPrompt;

    this.generate(chatObj, true, (text, delta, isEndOfStream) => {
      if (!firstTokenSeen) {
        clearInterval(this.genAnimationInteral);
        responseElement.textContent = text;
      }
      firstTokenSeen = true;
      this.setLastMessageText(text);
      responseElement.textContent = text;
      this.scrollDown();
      //callback(text);
    });
  }

  async generate(chatObj, stream = true, callback) {
    let responseText = "";

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model ?? "gpt-5-mini",
        stream,
        reasoning: { effort: this.reasoningEffort ?? "minimal" },
        text: { verbosity: "low" },
        input: chatObj,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      let msg = "An error occurred, please try again later";
      try {
        msg = JSON.parse(errText)?.error?.message ?? msg;
      } catch {}
      callback?.(msg, msg, true);
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    // ✅ NON-STREAMING: parse JSON once, extract text, call callback once
    if (!stream) {
      const obj = await res.json();

      // Responses API returns output items; assistant text is typically in:
      // output[].content[].type === "output_text" with a "text" field.  [oai_citation:1‡OpenAI Platform](https://platform.openai.com/docs/api-reference/responses/object)
      responseText = (obj.output ?? [])
        .flatMap((item) => (item.type === "message" ? (item.content ?? []) : []))
        .filter((part) => part.type === "output_text")
        .map((part) => part.text ?? "")
        .join("");

      callback?.(responseText, responseText, true);
      return responseText;
    }

    // ✅ STREAMING: read SSE events (Content-Type: text/event-stream)  [oai_citation:2‡OpenAI Platform](https://platform.openai.com/docs/api-reference/responses-streaming?utm_source=chatgpt.com)
    const reader = res.body?.getReader();
    if (!reader) {
      callback?.("Missing response body", "Missing response body", true);
      throw new Error("Missing response body");
    }

    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const evt of events) {
        const dataLine = evt.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;

        const payload = dataLine.slice("data: ".length).trim();
        if (!payload || payload === "[DONE]") continue;

        let obj;
        try {
          obj = JSON.parse(payload);
        } catch {
          continue;
        }

        switch (obj.type) {
          case "response.output_text.delta": {
            responseText += obj.delta ?? "";
            callback?.(responseText, obj.delta ?? "", false);
            break;
          }
          case "response.completed": {
            callback?.(responseText, "", true);
            return responseText;
          }
          case "response.error":
          case "error": {
            const msg = `FATAL ERROR: ${obj.error?.message ?? "Stream error"}`;
            responseText += msg;
            callback?.(responseText, msg, true);
            throw new Error(msg);
          }
          default:
            break;
        }
      }
    }

    // If we exit loop without a completed event, still finalize:
    callback?.(responseText, "", true);
    return responseText;
  }
}
