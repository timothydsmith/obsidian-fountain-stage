/**
 * Table read: the script read aloud with the device's built-in speech, a
 * voice for each character and a narrator for scene headings and stage
 * directions (or none). Parts you read yourself are highlighted, and the
 * read waits for you to go on. It shows in a strip at the top of the script.
 */

import { type App, Modal, Notice, Setting } from "obsidian";
import type { FountainView } from "./editor/FountainView";
import { assignVoices, type ReadItem, readItems, speechPieces, type VoiceChoice } from "./fountain/tableRead";

/** What the table read dialog was last given. */
export interface TableReadChoices {
  /** A voice for each character, by name. */
  voices: Record<string, VoiceChoice>;
  /** The narrator's voice URI, or blank for the device's default. */
  narrator: string;
  /** Read scene headings, stage directions and parentheticals. */
  directions: boolean;
  /** Speaking rate: 1 is the voice's own. */
  rate: number;
  /** Characters you read yourself. */
  readers: string[];
}

export const DEFAULT_TABLE_READ: TableReadChoices = { voices: {}, narrator: "", directions: true, rate: 1, readers: [] };

const STRIP = "table-read";
/** A breath between one part and the next. */
const GAP_MS = 250;
const RATES = [0.75, 0.9, 1, 1.1, 1.25, 1.5];

interface Read {
  path: string;
  items: ReadItem[];
  index: number;
  choices: TableReadChoices;
  voices: SpeechSynthesisVoice[];
  /** Waiting for you to read your line. */
  waiting: boolean;
  paused: boolean;
  /** Bumped to stop speech already queued from carrying on. */
  token: number;
}

/** How long to wait for the device's voices, which can take seconds to load the first time. */
const VOICES_WAIT_MS = 5000;

/** Whether the device has built-in speech at all. */
function canSpeak(): boolean {
  return typeof window.speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
}

/** Asks for the device's voices, so they've loaded by the time a table read starts. */
export function warmUpVoices(): void {
  if (canSpeak()) window.speechSynthesis.getVoices();
}

/** The device's voices, waiting for them where they load late. */
async function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length > 0) return now;
  return new Promise((resolve) => {
    // Some devices never say the voices changed, so they're looked for every so often too.
    const check = () => {
      const voices = synth.getVoices();
      if (voices.length > 0 || Date.now() - started >= VOICES_WAIT_MS) done(voices);
    };
    const done = (voices: SpeechSynthesisVoice[]) => {
      synth.removeEventListener("voiceschanged", check);
      window.clearInterval(timer);
      resolve(voices);
    };
    const started = Date.now();
    const timer = window.setInterval(check, 250);
    synth.addEventListener("voiceschanged", check);
  });
}

export class TableReads {
  private current: Read | null = null;

  constructor(
    private readonly app: App,
    private readonly choices: () => TableReadChoices,
    private readonly save: (choices: TableReadChoices) => void,
    private readonly scriptViews: () => FountainView[],
  ) {}

  running(): boolean {
    return this.current !== null;
  }

  /** Asks who reads what, then reads from the cursor's line. */
  async start(view: FountainView): Promise<void> {
    if (!view.file) return;
    if (!canSpeak()) {
      new Notice("This device can't read aloud: it has no built-in speech.");
      return;
    }
    this.stop();
    const voices = await loadVoices();
    if (voices.length === 0) {
      new Notice("This device has no voices to read aloud with.");
      return;
    }
    const characters = [...new Set(readItems(view.script(), { directions: false }).flatMap((item) => (item.speaker ? [item.speaker] : [])))];
    const saved = this.choices();
    const narrator = saved.narrator || voices.find((v) => v.default)?.voiceURI || voices[0].voiceURI;
    const assigned = assignVoices(
      characters,
      voices.map((v) => ({ uri: v.voiceURI, lang: v.lang })),
      saved.voices,
      narrator,
      navigator.language || "en",
    );
    new TableReadModal(this.app, characters, voices, { ...saved, narrator, voices: assigned }, (choices) => {
      this.save({ ...choices, voices: { ...saved.voices, ...choices.voices } });
      this.begin(view, choices, voices);
    }).open();
  }

  private begin(view: FountainView, choices: TableReadChoices, voices: SpeechSynthesisVoice[]): void {
    if (!view.file) return;
    const items = readItems(view.script(), { directions: choices.directions, fromLine: view.cursorLine().line });
    if (items.length === 0) {
      new Notice("There's nothing to read after the cursor.");
      return;
    }
    this.current = { path: view.file.path, items, index: 0, choices, voices, waiting: false, paused: false, token: 0 };
    this.play();
  }

  /** Goes on after your line, or skips the part being read. */
  next(): void {
    const read = this.current;
    if (!read) return;
    read.token++;
    window.speechSynthesis.cancel();
    read.waiting = false;
    read.paused = false;
    read.index++;
    this.play();
  }

  /** Stops reading for now, or starts the part again from its beginning. */
  pause(): void {
    const read = this.current;
    if (!read || read.waiting) return;
    read.paused = !read.paused;
    read.token++;
    window.speechSynthesis.cancel();
    if (read.paused) this.show();
    else this.play();
  }

  stop(): void {
    const read = this.current;
    if (!read) return;
    read.token++;
    this.current = null;
    if (canSpeak()) window.speechSynthesis.cancel();
    for (const view of this.scriptViews()) {
      view.strip(STRIP, false);
      if (view.file?.path === read.path) view.showReadLines(null);
    }
  }

  private viewOf(read: Read): FountainView | undefined {
    return this.scriptViews().find((v) => v.file?.path === read.path);
  }

  /** Reads the current part, or waits for you if it's yours. */
  private play(): void {
    const read = this.current;
    if (!read) return;
    const item = read.items[read.index];
    const view = this.viewOf(read);
    if (!item || !view) {
      if (!item) new Notice("The table read is over.");
      this.stop();
      return;
    }
    view.showReadLines(item);
    if (item.speaker && read.choices.readers.includes(item.speaker)) {
      read.waiting = true;
      this.show();
      return;
    }
    this.show();
    const token = ++read.token;
    const choice = item.speaker ? read.choices.voices[item.speaker] : undefined;
    const voice = read.voices.find((v) => v.voiceURI === (choice?.voice ?? read.choices.narrator));
    const pieces = speechPieces(item.text);
    const speak = (k: number) => {
      if (this.current !== read || read.token !== token) return;
      if (k >= pieces.length) {
        window.setTimeout(() => {
          if (this.current !== read || read.token !== token) return;
          read.index++;
          this.play();
        }, GAP_MS);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(pieces[k]);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      utterance.pitch = choice?.pitch ?? 1;
      utterance.rate = read.choices.rate;
      utterance.onend = () => speak(k + 1);
      utterance.onerror = (event) => {
        // Cancelling to pause or skip ends speech with an error; anything else stops the read.
        if (event.error === "interrupted" || event.error === "canceled") return;
        console.error("[fountain-stage] table read stopped", event.error);
        new Notice("The device stopped reading aloud.");
        this.stop();
      };
      window.speechSynthesis.speak(utterance);
    };
    speak(0);
  }

  /** The strip on the script being read. */
  private show(): void {
    const read = this.current;
    if (!read) return;
    const item = read.items[read.index];
    for (const view of this.scriptViews()) {
      if (view.file?.path !== read.path) {
        view.strip(STRIP, false);
        continue;
      }
      const el = view.strip(STRIP, true)!;
      el.createSpan({ cls: "fountain-stage-strip-label", text: "Table read" });
      const who = item?.speaker ?? "Stage directions";
      const status = read.waiting ? `Your line: ${who}` : read.paused ? `Paused at ${who}` : who;
      el.createSpan({ cls: "fountain-stage-strip-text", text: status });
      const button = (text: string, run: () => void, cta = false) => {
        const b = el.createEl("button", { text });
        if (cta) b.addClass("mod-cta");
        b.addEventListener("click", run);
      };
      if (read.waiting) button("Next", () => this.next(), true);
      else {
        button(read.paused ? "Resume" : "Pause", () => this.pause());
        button("Skip", () => this.next());
      }
      button("Stop", () => this.stop());
    }
  }
}

/** Who reads what: a voice for each character, the narrator, and the parts you read. */
class TableReadModal extends Modal {
  private choices: TableReadChoices;

  constructor(
    app: App,
    private readonly characters: string[],
    private readonly voices: SpeechSynthesisVoice[],
    choices: TableReadChoices,
    private readonly onStart: (choices: TableReadChoices) => void,
  ) {
    super(app);
    this.choices = { ...choices, voices: { ...choices.voices }, readers: [...choices.readers] };
  }

  onOpen(): void {
    this.setTitle("Table read");
    const { contentEl } = this;
    contentEl.createEl("p", { text: "Reads aloud from the cursor's line. Parts you read yourself are highlighted, and the read waits for you to go on." });
    const voiceDropdown = (setting: Setting, value: string, onChange: (uri: string) => void) =>
      setting.addDropdown((dropdown) => {
        for (const v of this.voices) dropdown.addOption(v.voiceURI, `${v.name} (${v.lang})`);
        dropdown.setValue(value).onChange(onChange);
      });
    const tryVoice = (setting: Setting, text: string, choice: () => VoiceChoice) =>
      setting.addExtraButton((button) =>
        button
          .setIcon("play")
          .setTooltip("Hear this voice")
          .onClick(() => {
            const { voice, pitch } = choice();
            const utterance = new SpeechSynthesisUtterance(text);
            const v = this.voices.find((x) => x.voiceURI === voice);
            if (v) utterance.voice = v;
            utterance.pitch = pitch;
            utterance.rate = this.choices.rate;
            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance);
          }),
      );

    new Setting(contentEl)
      .setName("Read stage directions")
      .setDesc("Scene headings, stage directions and parentheticals, in the narrator's voice.")
      .addToggle((toggle) => toggle.setValue(this.choices.directions).onChange((value) => (this.choices.directions = value)));
    const narrator = new Setting(contentEl).setName("Narrator");
    voiceDropdown(narrator, this.choices.narrator, (uri) => (this.choices.narrator = uri));
    tryVoice(narrator, "Interior. A kitchen. Day.", () => ({ voice: this.choices.narrator, pitch: 1 }));
    new Setting(contentEl).setName("Speed").addDropdown((dropdown) => {
      for (const rate of RATES) dropdown.addOption(String(rate), rate === 1 ? "Normal" : `${rate}×`);
      dropdown.setValue(String(RATES.includes(this.choices.rate) ? this.choices.rate : 1)).onChange((value) => (this.choices.rate = Number(value)));
    });

    if (this.characters.length > 0) {
      new Setting(contentEl).setName("Parts").setHeading();
      const list = contentEl.createDiv({ cls: "fountain-stage-table-read-parts" });
      for (const name of this.characters) {
        const setting = new Setting(list).setName(name);
        const current = () => this.choices.voices[name] ?? { voice: this.choices.narrator, pitch: 1 };
        voiceDropdown(setting, current().voice, (uri) => (this.choices.voices[name] = { ...current(), voice: uri }));
        tryVoice(setting, `This is ${name.toLowerCase()}.`, current);
        setting.addToggle((toggle) =>
          toggle
            .setTooltip("I'll read this part")
            .setValue(this.choices.readers.includes(name))
            .onChange((mine) => {
              this.choices.readers = mine ? [...this.choices.readers, name] : this.choices.readers.filter((r) => r !== name);
            }),
        );
      }
      contentEl.createEl("p", { cls: "setting-item-description", text: "Turn a part on to read it yourself." });
    }

    new Setting(contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText("Start reading")
          .setCta()
          .onClick(() => {
            window.speechSynthesis.cancel();
            this.onStart(this.choices);
            this.close();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
