import type { CardDefinition } from "../types/game";
import defaultDeckByTribe from "./defaultDeck.json";
import botDeckJson from "./botDeck.json";
import tutorialDeckJson from "./tutorialDeck.json";
import tutorialBotDeckJson from "./tutorialBotDeck.json";
import { withRarity, type CardDraft } from "./rarity";

/** Generate card image path from running code, e.g. S0001 → /cards/S0001.png */
export function cardImage(code: string): string {
  return `/cards/${code}.png`;
}

/** Shared Alkata leave-field hand-summon clause */
export const ALKATA_HAND_SUMMON_TEXT =
  'สั่งใช้จากมือเมื่อมอนสเตอร์เทพแห่งอัลคาทาของเราออกจากสนาม (ถูกทำลาย · ขึ้นมือ · กลับเด็ค) อัญเชิญการ์ดใบนี้จากมือ (อัญเชิญเทพแห่งอัลคาทาได้ 1 ตัวต่อการออกจากสนาม 1 ครั้ง · ด้วยเอฟเฟคนี้ อัญเชิญการ์ดใบเดียวกันได้เทิร์นละ 1 ครั้งเท่านั้น)'

/** Unique effect · hand summon */
export function alkataDescription(uniqueEffect: string): string {
  return `${uniqueEffect}\n\n${ALKATA_HAND_SUMMON_TEXT}`
}

const CARD_DRAFTS: CardDraft[] = [
  // —— Insects ——
  {
    id: "S0001",
    name: "Swarm Beetle",
    nameTh: "ด้วงฝูง",
    type: "monster",
    tribe: "insect",
    atk: 1,
    cost: 0,
    image: cardImage("S0001"),
    description: "มอนสเตอร์แมลงขนาดเล็ก ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0002",
    name: "Stinger Wasp",
    nameTh: "ต่อเหล็กใน",
    type: "monster",
    tribe: "insect",
    atk: 2,
    cost: 1,
    image: cardImage("S0002"),
    description: "มอนสเตอร์แมลงโจมตีเร็ว ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0003",
    name: "Iron Scarab",
    nameTh: "สคารับเหล็ก",
    type: "monster",
    tribe: "insect",
    atk: 3,
    cost: 2,
    image: cardImage("S0003"),
    description: "มอนสเตอร์แมลงเกราะหนา ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0004",
    name: "Queen Hive",
    nameTh: "ราชินีรัง",
    type: "monster",
    tribe: "insect",
    atk: 5,
    cost: 4,
    image: cardImage("S0004"),
    description: "มอนสเตอร์แมลงระดับสูง ไม่มีความสามารถพิเศษ",
  },
  // —— Dragons ——
  {
    id: "S0005",
    name: "Ember Wyrmling",
    nameTh: "ลูกมังกรเถ้าไฟ",
    type: "monster",
    tribe: "dragon",
    atk: 2,
    cost: 1,
    image: cardImage("S0005"),
    description: "มอนสเตอร์มังกรวัยเยาว์ ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0006",
    name: "Storm Drake",
    nameTh: "มังกรพายุ",
    type: "monster",
    tribe: "dragon",
    atk: 4,
    cost: 3,
    image: cardImage("S0006"),
    description: "มอนสเตอร์มังกรสายฟ้า ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0007",
    name: "Ancient Dragon",
    nameTh: "มังกรโบราณ",
    type: "monster",
    tribe: "dragon",
    atk: 7,
    cost: 6,
    image: cardImage("S0007"),
    description: "มอนสเตอร์มังกรโบราณอันทรงพลัง ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0008",
    name: "Void Dragon",
    nameTh: "มังกรสูญญากาศ",
    type: "monster",
    tribe: "dragon",
    atk: 9,
    cost: 8,
    image: cardImage("S0008"),
    description: "มอนสเตอร์มังกรแห่งความว่างเปล่า ไม่มีความสามารถพิเศษ",
  },
  // —— Warriors ——
  {
    id: "S0009",
    name: "Recruit",
    nameTh: "ทหารใหม่",
    type: "monster",
    tribe: "warrior",
    atk: 1,
    cost: 0,
    image: cardImage("S0009"),
    description: "มอนสเตอร์นักรบมือใหม่ ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0010",
    name: "Blade Knight",
    nameTh: "อัศวินดาบ",
    type: "monster",
    tribe: "warrior",
    atk: 3,
    cost: 2,
    image: cardImage("S0010"),
    description: "มอนสเตอร์นักรบดาบคม ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0011",
    name: "Shield Captain",
    nameTh: "กัปตันโล่",
    type: "monster",
    tribe: "warrior",
    atk: 4,
    cost: 3,
    image: cardImage("S0011"),
    description: "มอนสเตอร์นักรบผู้บัญชาการ ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0012",
    name: "Warlord",
    nameTh: "จอมทัพ",
    type: "monster",
    tribe: "warrior",
    atk: 6,
    cost: 5,
    image: cardImage("S0012"),
    description: "มอนสเตอร์นักรบระดับจอมทัพ ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0023",
    name: "Frontline Warrior",
    nameTh: "นักรบแนวหน้า",
    type: "monster",
    tribe: "warrior",
    atk: 0,
    cost: 1,
    effectId: "frontline_warrior",
    image: cardImage("S0023"),
    description:
      "มีบนสนามเราได้เพียง 1 ใบ · หากมีนักรบใบอื่นบนสนามเรา ฝ่ายตรงข้ามโจมตีการ์ดนี้ไม่ได้ · ขณะอยู่บนสนาม นักรบทุกใบบนสนามฝั่งเราได้ ATK +1 ต่อจำนวนนักรบทั้งหมดบนสนามทั้งสองฝั่ง",
  },
  {
    id: "S0024",
    name: "Support Unit",
    nameTh: "หน่วยสนับสนุน",
    type: "monster",
    tribe: "warrior",
    atk: 0,
    cost: 0,
    effectId: "support_unit",
    image: cardImage("S0024"),
    description:
      "มีบนสนามเราได้เพียง 1 ใบ · หากมีนักรบใบอื่นบนสนามเรา ฝ่ายตรงข้ามโจมตีมอนสเตอร์ตัวอื่นไม่ได้ ยกเว้นการ์ดใบนี้ · ขณะอยู่บนสนาม นักรบทุกใบบนสนามฝั่งเราได้ ATK +1 ต่อจำนวนนักรบทั้งหมดบนสนามทั้งสองฝั่ง",
  },
  {
    id: "S0025",
    name: "Iron Wall Warrior",
    nameTh: "นักรบกำแพงเหล็ก",
    type: "monster",
    tribe: "warrior",
    atk: 7,
    cost: 3,
    effectId: "iron_wall_warrior",
    image: cardImage("S0025"),
    description:
      "หากไม่มีมอนสเตอร์นักรบใบอื่นบนสนามฝั่งเรา การ์ดใบนี้โจมตีไม่ได้ · หากการ์ดใบนี้ถูกทำลาย ทำความเสียหายแก่พลังชีวิตเรา 3 หน่วย",
  },
  {
    id: "S0026",
    name: "Scout Unit",
    nameTh: "หน่วยสอดแนม",
    type: "monster",
    tribe: "warrior",
    atk: 0,
    cost: 0,
    effectId: "scout_unit",
    image: cardImage("S0026"),
    description:
      "อัญเชิญลงสนามเราได้เมื่อมีโซนว่าง จากนั้นเปลี่ยนการควบคุมไปสนามอีกฝ่าย (ต้องมีโซนว่างฝั่งนั้นด้วย) · มอนสเตอร์บนสนามฝั่งที่ควบคุมการ์ดนี้ทุกใบ ATK −1 ต่อจำนวนนักรบบนสนามทั้งสองฝั่ง",
  },
  {
    id: "S0030",
    name: "Ultimate Warrior Kona",
    nameTh: "สุดยอดนักรบ โคน่า",
    type: "monster",
    tribe: "warrior",
    atk: 7,
    cost: 7,
    effectId: "kona_draw",
    image: cardImage("S0030"),
    description: "เมื่อการ์ดใบนี้โจมตี จั่วการ์ด 1 ใบ",
  },
  {
    id: "S0033",
    name: "Soluy Air Soldier",
    nameTh: "โซลุย ทหารอากาศ",
    type: "monster",
    tribe: "warrior",
    atk: 3,
    cost: 3,
    effectId: "soluy_swap",
    image: cardImage("S0033"),
    description:
      'เทิร์นละสองครั้ง: ส่งมอนสเตอร์นักรบบนสนามเรา 1 ใบ (ยกเว้น โซลุย ทหารอากาศ) กลับขึ้นมือ แล้วอัญเชิญมอนสเตอร์นักรบ 1 ใบจากมือลงสนาม (รวมตัวที่เพิ่งส่งขึ้นมือ)',
  },
  {
    id: "S0034",
    name: "Sari Sea Warrior",
    nameTh: "ซาริ นักรบแห่งท้องทะเล",
    type: "monster",
    tribe: "warrior",
    atk: 3,
    cost: 5,
    effectId: "sari_rally",
    image: cardImage("S0034"),
    description:
      "เมื่อการ์ดใบนี้ถูกอัญเชิญ มอนสเตอร์เผ่านักรบทั้งหมดบนสนามเรา ATK +2 และถ้าการ์ดใบนี้ถูกนำขึ้นมือจากบนสนาม มอนสเตอร์เผ่านักรบทั้งหมดบนสนามเรา ATK +2",
  },
  {
    id: "S0035",
    name: "Michael Scout Warrior",
    nameTh: "ไมเคิล นักรบสอดแนม",
    type: "monster",
    tribe: "warrior",
    atk: 1,
    cost: 3,
    effectId: "michael_scout",
    image: cardImage("S0035"),
    description:
      "เมื่อการ์ดใบนี้ถูกอัญเชิญ มอนสเตอร์ฝ่ายตรงข้ามทั้งหมดบนสนาม ATK −2 และถ้าการ์ดใบนี้ถูกนำขึ้นมือจากบนสนาม มอนสเตอร์ฝ่ายตรงข้ามทั้งหมดบนสนาม ATK −2",
  },
  {
    id: "S0036",
    name: "Mina Ultimate Warrior",
    nameTh: "มีน่า สุดยอดนักรบ",
    type: "monster",
    tribe: "warrior",
    atk: 5,
    cost: 5,
    effectId: "mina_recruit",
    image: cardImage("S0036"),
    description:
      "เมื่อการ์ดใบนี้ถูกอัญเชิญ เลือกมอนสเตอร์นักรบจากเด็ค 1 ใบอัญเชิญลงสนาม (ต้องมีโซนว่าง) ยกเว้น มีน่า สุดยอดนักรบ",
  },
  {
    id: "S0037",
    name: "Sara Trainee Warrior",
    nameTh: "ซาร่า นักรบฝึกหัด",
    type: "monster",
    tribe: "warrior",
    atk: 0,
    cost: 0,
    effectId: "sara_sacrifice",
    image: cardImage("S0037"),
    description:
      "เมื่อการ์ดใบนี้ถูกอัญเชิญ ทำลายการ์ดใบนี้และทิ้งการ์ดจากมือ 1 ใบ แล้วสามารถอัญเชิญมอนสเตอร์นักรบจากเด็ค 1 ตัวลงสนาม",
  },
  {
    id: "S0046",
    name: "Sora Bomb Warrior",
    nameTh: "โซระ นักรบวางระเบิด",
    type: "monster",
    tribe: "warrior",
    atk: 5,
    cost: 7,
    effectId: "sora_bomb",
    image: cardImage("S0046"),
    description:
      "เมื่อการ์ดใบนี้ถูกอัญเชิญ หากฝ่ายตรงข้ามมีมอนสเตอร์บนสนาม ทำลายมอนสเตอร์ฝ่ายตรงข้าม 1 ตัว",
  },
  // —— Robots ——
  {
    id: "S0013",
    name: "Scrap Bot",
    nameTh: "บอทเศษเหล็ก",
    type: "monster",
    tribe: "robot",
    atk: 1,
    cost: 0,
    image: cardImage("S0013"),
    description: "มอนสเตอร์หุ่นยนต์เศษซาก ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0014",
    name: "Pulse Unit",
    nameTh: "ยูนิตพัลส์",
    type: "monster",
    tribe: "robot",
    atk: 3,
    cost: 2,
    image: cardImage("S0014"),
    description: "มอนสเตอร์หุ่นยนต์พลังงาน ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0015",
    name: "Titan Mech",
    nameTh: "ไททันเมค",
    type: "monster",
    tribe: "robot",
    atk: 6,
    cost: 5,
    image: cardImage("S0015"),
    description: "มอนสเตอร์หุ่นยนต์ยักษ์ ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0016",
    name: "Omega Core",
    nameTh: "โอเมก้าคอร์",
    type: "monster",
    tribe: "robot",
    atk: 8,
    cost: 7,
    image: cardImage("S0016"),
    description: "มอนสเตอร์หุ่นยนต์ระดับสูงสุด ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0038",
    name: "Sola-01 Destruction Robot",
    nameTh: "หุ่นยนต์แห่งการทำลาย โซล่า 01",
    type: "monster",
    tribe: "robot",
    atk: 5,
    cost: 6,
    effectId: "sola_destroyer",
    image: cardImage("S0038"),
    description:
      "อัญเชิญจากมือโดยจ่ายพลังชีวิต 6 หน่วย · ATK เริ่มต้น 5 และเพิ่มขึ้นเท่ากับผลต่างพลังชีวิตฝ่ายเรากับฝ่ายตรงข้าม ÷ 2 (เศษปัดลง) · เมื่อการ์ดใบนี้โจมตี อีกฝ่ายใช้กับดักไม่ได้",
  },
  {
    id: "S0039",
    name: "Sigma Destruction Robot",
    nameTh: "หุ่นยนต์แห่งการทำลาย ซิกม่า",
    type: "monster",
    tribe: "robot",
    atk: 5,
    cost: 6,
    effectId: "sigma_destroyer",
    image: cardImage("S0039"),
    description:
      "อัญเชิญจากมือโดยจ่ายพลังชีวิต 6 หน่วย · ATK เริ่มต้น 5 และเพิ่มขึ้นเท่ากับผลต่างพลังชีวิตฝ่ายเรากับฝ่ายตรงข้าม ÷ 2 (เศษปัดลง) · เมื่อการ์ดใบนี้โจมตี มอนสเตอร์ฝ่ายตรงข้ามทุกตัว ATK −5 จนจบเทิร์น",
  },
  {
    id: "S0040",
    name: "Gamma Destruction Robot",
    nameTh: "หุ่นยนต์แห่งการทำลาย แกรมม่า",
    type: "monster",
    tribe: "robot",
    atk: 5,
    cost: 6,
    effectId: "gamma_destroyer",
    image: cardImage("S0040"),
    description:
      "อัญเชิญจากมือโดยจ่ายพลังชีวิต 6 หน่วย · ATK เริ่มต้น 5 และเพิ่มขึ้นเท่ากับผลต่างพลังชีวิตฝ่ายเรากับฝ่ายตรงข้าม ÷ 2 (เศษปัดลง) · เมื่อการ์ดใบนี้โจมตี ผู้เล่นทุกคนจั่วการ์ด 1 ใบ",
  },
  {
    id: "S0041",
    name: "Beta Destruction Robot",
    nameTh: "หุ่นยนต์แห่งการทำลาย เบต้า",
    type: "monster",
    tribe: "robot",
    atk: 5,
    cost: 6,
    effectId: "beta_destroyer",
    image: cardImage("S0041"),
    description:
      "อัญเชิญจากมือโดยจ่ายพลังชีวิต 6 หน่วย · ATK เริ่มต้น 5 และเพิ่มขึ้นเท่ากับผลต่างพลังชีวิตฝ่ายเรากับฝ่ายตรงข้าม ÷ 2 (เศษปัดลง) · เมื่อโจมตีแล้วทำลายมอนสเตอร์อีกฝ่ายได้ เลือกทำลายมอนสเตอร์บนสนามอีกฝ่ายได้อีก 1 ตัวถ้ามี",
  },
  {
    id: "S0042",
    name: "Omega Destruction Robot",
    nameTh: "หุ่นยนต์แห่งการทำลาย โอเมก้า",
    type: "monster",
    tribe: "robot",
    atk: 5,
    cost: 6,
    effectId: "omega_destroyer",
    image: cardImage("S0042"),
    description:
      'อัญเชิญจากมือโดยจ่ายพลังชีวิต 6 หน่วย · ATK เริ่มต้น 5 และเพิ่มขึ้นเท่ากับผลต่างพลังชีวิตฝ่ายเรากับฝ่ายตรงข้าม ÷ 2 (เศษปัดลง) · เมื่ออัญเชิญ นำการ์ดชื่อ "หุ่นยนต์แห่งการทำลาย" จากเด็คขึ้นมือได้มากสุด 2 ใบ',
  },
  // —— Gods ——
  {
    id: "S0017",
    name: "Lesser Spirit",
    nameTh: "วิญญาณน้อย",
    type: "monster",
    tribe: "god",
    atk: 2,
    cost: 2,
    image: cardImage("S0017"),
    description: "มอนสเตอร์เทพระดับต่ำ ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0018",
    name: "Divine Sentinel",
    nameTh: "ผู้พิทักษ์เทพ",
    type: "monster",
    tribe: "god",
    atk: 5,
    cost: 4,
    image: cardImage("S0018"),
    description: "มอนสเตอร์เทพผู้พิทักษ์ ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0019",
    name: "Sky God",
    nameTh: "เทพแห่งนภา",
    type: "monster",
    tribe: "god",
    atk: 8,
    cost: 7,
    image: cardImage("S0019"),
    description: "มอนสเตอร์เทพแห่งท้องฟ้า ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0020",
    name: "Primordial Deity",
    nameTh: "เทพบรรพกาล",
    type: "monster",
    tribe: "god",
    atk: 10,
    cost: 9,
    image: cardImage("S0020"),
    description: "มอนสเตอร์เทพสูงสุด ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0047",
    name: "Sorun God of Alkata",
    nameTh: "โซรุน เทพแห่งอัลคาทา",
    type: "monster",
    tribe: "god",
    atk: 5,
    cost: 5,
    effectId: "sorun_alkata",
    image: cardImage("S0047"),
    description: alkataDescription(
      "เมื่อการ์ดใบนี้ถูกอัญเชิญ เลือกมอนสเตอร์ฝ่ายตรงข้าม 1 ตัว ATK −3 หากเหลือ 0 ทำลายการ์ดนั้น",
    ),
  },
  {
    id: "S0048",
    name: "Sona God of Alkata",
    nameTh: "โซน่า เทพแห่งอัลคาทา",
    type: "monster",
    tribe: "god",
    atk: 3,
    cost: 4,
    effectId: "sona_alkata",
    image: cardImage("S0048"),
    description: alkataDescription(
      "เมื่อการ์ดใบนี้ถูกอัญเชิญ มอนสเตอร์เทพแห่งอัลคาทาบนสนามเราทุกตัว ATK +2",
    ),
  },
  {
    id: "S0049",
    name: "Zul God of Alkata",
    nameTh: "ซูล เทพแห่งอัลคาทา",
    type: "monster",
    tribe: "god",
    atk: 0,
    cost: 0,
    effectId: "zul_alkata",
    image: cardImage("S0049"),
    description: alkataDescription(
      "เมื่อการ์ดใบนี้ถูกอัญเชิญ นำเทพแห่งอัลคาทาจากเด็คขึ้นมือ 1 ใบ (ยกเว้นซูล เทพแห่งอัลคาทา)",
    ),
  },
  {
    id: "S0050",
    name: "Yori God of Alkata",
    nameTh: "โยริ เทพแห่งอัลคาทา",
    type: "monster",
    tribe: "god",
    atk: 6,
    cost: 6,
    effectId: "yori_alkata",
    image: cardImage("S0050"),
    description: alkataDescription(
      "เมื่อการ์ดใบนี้ต่อสู้ สุ่มยึดการ์ดบนมือฝ่ายตรงข้าม 1 ใบมาไว้บนมือเรา",
    ),
  },
  {
    id: "S0051",
    name: "Mina God of Alkata",
    nameTh: "มิน่า เทพแห่งอัลคาทา",
    type: "monster",
    tribe: "god",
    atk: 0,
    cost: 5,
    effectId: "mina_alkata",
    image: cardImage("S0051"),
    description: alkataDescription(
      "เมื่อการ์ดใบนี้ถูกอัญเชิญ อัญเชิญเทพแห่งอัลคาทา 1 ใบจากเด็ค แล้วนำ ATK ของการ์ดใบนี้ให้เท่ากับมอนสเตอร์ที่อัญเชิญด้วยเอฟเฟคนี้",
    ),
  },
  {
    id: "S0054",
    name: "Hokana God of Alkata",
    nameTh: "โฮคาน่า เทพแห่งอัลคาทา",
    type: "monster",
    tribe: "god",
    atk: 3,
    cost: 5,
    effectId: "hokana_alkata",
    image: cardImage("S0054"),
    description: alkataDescription(
      "เมื่อการ์ดใบนี้ถูกอัญเชิญ นำเทพแห่งอัลคาทา 2 ใบจากสุสานกลับเข้าเด็ค",
    ),
  },
  // —— Spell ——
  {
    id: "S0021",
    name: "Energy Charge",
    nameTh: "ชาร์จพลังงาน",
    type: "spell",
    cost: 0,
    effectId: "energy_charge",
    image: cardImage("S0021"),
    description: "เพิ่มพลังงานให้ผู้เล่น 3 หน่วย",
  },
  {
    id: "S0027",
    name: "Call Reinforcements",
    nameTh: "ขอกำลังเสริม",
    type: "spell",
    cost: 3,
    effectId: "call_reinforcements",
    image: cardImage("S0027"),
    description:
      "อัญเชิญมอนสเตอร์นักรบจากมือได้สูงสุด 3 ใบ โดยจ่ายค่าร่ายด้วยพลังชีวิตแทนพลังงาน · ใช้ไม่ได้ถ้าสนามมอนสเตอร์เต็ม หรือไม่มีนักรบในมือ",
  },
  {
    id: "S0028",
    name: "Heavenly Voice",
    nameTh: "เสียงสวรรค์",
    type: "spell",
    cost: 0,
    effectId: "heavenly_voice",
    image: cardImage("S0028"),
    description: "จั่วการ์ดจากเด็ค 2 ใบ",
  },
  {
    id: "S0031",
    name: "Soul Drain",
    nameTh: "สูบวิญญาณ",
    type: "spell",
    cost: 1,
    effectId: "soul_drain",
    image: cardImage("S0031"),
    description:
      "เลือกมอนสเตอร์บนสนามเรา 1 ตัวส่งลงสุสาน แล้วเพิ่ม ATK ให้มอนสเตอร์อีก 1 ตัวบนสนามเราเท่ากับ ATK ของการ์ดที่ถูกส่ง",
  },
  {
    id: "S0032",
    name: "Emergency Reinforcements",
    nameTh: "กำลังเสริมฉุกเฉิน",
    type: "spell",
    cost: 1,
    effectId: "emergency_reinforce",
    image: cardImage("S0032"),
    description:
      "เลือกมอนสเตอร์จากเด็ค 1 ใบนำขึ้นมือ · หากมอนสเตอร์นั้นมี ATK น้อยกว่า 5 สามารถอัญเชิญลงสนามได้ทันที (ไม่จ่ายพลังงาน)",
  },
  {
    id: "S0043",
    name: "Special Modification",
    nameTh: "ดัดแปลงขั้นพิเศษ",
    type: "spell",
    tribe: "robot",
    cost: 0,
    effectId: "special_mod",
    image: cardImage("S0043"),
    description:
      "จ่ายพลังชีวิต 5 หน่วย แล้วเลือกมอนสเตอร์หุ่นยนต์แห่งการทำลายบนสนามเรา 1 ใบ — ATK ของการ์ดนั้นเพิ่มขึ้นเท่ากับผลต่างพลังชีวิตฝ่ายเรากับฝ่ายตรงข้าม",
  },
  {
    id: "S0044",
    name: "Interference Signal",
    nameTh: "สัญญาณแทรกซ้อน",
    type: "spell",
    cost: 2,
    effectId: "interference_signal",
    image: cardImage("S0044"),
    description:
      'นำการ์ด "หุ่นยนต์แห่งการทำลาย" จากเด็คขึ้นมือ 1 ใบ แล้วเพิ่มพลังชีวิตให้ฝ่ายตรงข้ามเท่ากับค่าร่ายของการ์ดใบนั้น',
  },
  {
    id: "S0045",
    name: "Signal Amplifier",
    nameTh: "เครื่องขยายสัญญาณ",
    type: "spell",
    cost: 5,
    effectId: "signal_amplifier",
    image: cardImage("S0045"),
    description:
      'จ่ายพลังชีวิต 20 และเพิ่ม HP ฝ่ายตรงข้าม 20 · อัญเชิญ "หุ่นยนต์แห่งการทำลาย" จากสุสานได้มากสุด 2 ตัว (ถูกทำลายตอนจบเทิร์น)',
  },
  {
    id: "S0052",
    name: "Alkata's Call",
    nameTh: "เสียงเรียกของอัลคาทา",
    type: "spell",
    cost: 2,
    effectId: "alkata_call",
    image: cardImage("S0052"),
    description:
      "ทิ้งการ์ดจากมือ 1 ใบ แล้วอัญเชิญเทพแห่งอัลคาทาจากเด็ค 1 ใบ — มอนสเตอร์ที่อัญเชิญด้วยเอฟเฟคนี้ถูกทำลายเมื่อเข้าสู่ Battle Phase",
  },
  {
    id: "S0053",
    name: "Alkata's Plan",
    nameTh: "การวางแผนของอัลคาทา",
    type: "spell",
    cost: 0,
    effectId: "alkata_plot",
    image: cardImage("S0053"),
    description:
      "ทำลายมอนสเตอร์เทพแห่งอัลคาทาบนสนามเรา 1 ใบ แล้วจั่วการ์ด 2 ใบ",
  },
  // —— Trap ——
  {
    id: "S0022",
    name: "Shield of Light",
    nameTh: "โล่แห่งแสง",
    type: "trap",
    cost: 2,
    effectId: "light_shield",
    image: cardImage("S0022"),
    description:
      "ใช้จากมือเมื่อมอนสเตอร์ของเราจะถูกทำลาย — มอนสเตอร์ใบนั้นรอด (จ่ายค่าร่ายเทิร์นหน้า)",
  },
  {
    id: "S0029",
    name: "Death Blast",
    nameTh: "ระเบิดความตาย",
    type: "trap",
    cost: 0,
    effectId: "death_blast",
    image: cardImage("S0029"),
    description:
      "ใช้จากมือเมื่ออีกฝ่ายประกาศโจมตี — มอนสเตอร์บนสนามอีกฝ่ายทุกตัว ATK −2 (จ่ายค่าร่ายเทิร์นหน้า)",
  },

  // —— Box S01 ——
  {
    id: "S0101",
    name: "Sorcerer Shorin",
    nameTh: "จอมเวทย์ โชริน",
    type: "monster",
    tribe: "mage",
    atk: 2,
    cost: 2,
    effectId: "shorin_mage",
    rarity: "SR",
    image: cardImage("S0101"),
    description:
      "เทิร์นละครั้ง: ทิ้งการ์ด 1 ใบจากบนมือ นำเวทย์มนต์หรือกับดักที่มีชื่อ «คาถา» จากเด็คหรือสุสานขึ้นมือ\nเมื่อเราเปิดใช้เวทย์มนต์หรือกับดักที่มีชื่อ «คาถา» การ์ดใบนี้ ATK +2",
  },
  {
    id: "S0102",
    name: "Mage Apprentice",
    nameTh: "ลูกศิษย์จอมเวทย์",
    type: "monster",
    tribe: "mage",
    atk: 1,
    cost: 0,
    image: cardImage("S0102"),
    description: "จอมเวทย์ฝึกหัด ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0103",
    name: "Wand Cadet",
    nameTh: "เด็กฝึกไม้กายสิทธิ์",
    type: "monster",
    tribe: "mage",
    atk: 1,
    cost: 1,
    image: cardImage("S0103"),
    description: "จอมเวทย์ฝึกหัด ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0104",
    name: "Circle Acolyte",
    nameTh: "สาวกแห่งวงเวท",
    type: "monster",
    tribe: "mage",
    atk: 2,
    cost: 1,
    image: cardImage("S0104"),
    description: "จอมเวทย์ฝึกหัด ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0105",
    name: "Rune Scribe",
    nameTh: "นักจารึกคาถารูน",
    type: "monster",
    tribe: "mage",
    atk: 2,
    cost: 2,
    image: cardImage("S0105"),
    description: "จอมเวทย์ฝึกหัด ไม่มีความสามารถพิเศษ",
  },
  {
    id: "S0106",
    name: "Fire Incantation",
    nameTh: "คาถาเพลิง",
    type: "spell",
    cost: 2,
    effectId: "energy_charge",
    image: cardImage("S0106"),
    description: "คาถา — ได้รับพลังงาน +3",
  },
  {
    id: "S0107",
    name: "Ward Incantation",
    nameTh: "คาถาคุ้มกัน",
    type: "trap",
    cost: 2,
    effectId: "light_shield",
    image: cardImage("S0107"),
    description:
      "คาถา — ใช้จากมือเมื่อมอนสเตอร์ของเราจะถูกทำลาย — มอนสเตอร์ใบนั้นรอด (จ่ายค่าร่ายเทิร์นหน้า)",
  },
  {
    id: "S0108",
    name: "Sorcerer Agatha",
    nameTh: "จอมเวทย์ อากาธา",
    type: "monster",
    tribe: "mage",
    atk: 3,
    cost: 2,
    effectId: "agatha_mage",
    rarity: "SR",
    image: cardImage("S0108"),
    description:
      "เทิร์นละครั้ง: นำเวทย์/กับดักที่มีชื่อ «คาถา» จากสุสานกลับเข้าเด็ค แล้วนำการ์ดคาถาจากเด็ค 1 ใบขึ้นมือ — จอมเวทย์ทั้งหมด ATK +3 จนจบเทิร์น (ต้องมีคาถาในสุสานก่อน)\nเทิร์นละครั้ง: เมื่อเราเปิดใช้เวทย์/กับดักที่มีชื่อ «คาถา» จั่ว 1 ใบ",
  },
  {
    id: "S0109",
    name: "Sorcerer Noah",
    nameTh: "จอมเวทย์ โนอา",
    type: "monster",
    tribe: "mage",
    atk: 3,
    cost: 3,
    effectId: "noah_mage",
    rarity: "SR",
    image: cardImage("S0109"),
    description:
      "เทิร์นละครั้ง: นำเวทย์/กับดักที่มีชื่อ «คาถา» จากเด็คลงสุสาน แล้วสั่งใช้ความสามารถของการ์ดใบนั้น (นับว่าเปิดใช้คาถา)\nเมื่อเราเปิดใช้เวทย์/กับดักที่มีชื่อ «คาถา» จอมเวทย์ทั้งหมดบนสนามเรา ATK +1",
  },
  {
    id: "S0110",
    name: "Guardian Incantation",
    nameTh: "คาถาผู้ป้องกัน",
    type: "spell",
    cost: 3,
    effectId: "kata_guardian",
    image: cardImage("S0110"),
    description:
      "คาถา — เลือกมอนสเตอร์จอมเวทย์บนสนามเรา 1 ใบ จนจบเทิร์นของอีกฝ่าย การ์ดใบนั้นจะไม่ถูกทำลายจากการต่อสู้ 1 ครั้ง",
  },
  {
    id: "S0111",
    name: "Preparation Incantation",
    nameTh: "คาถาแห่งการเตรียมตัว",
    type: "spell",
    cost: 2,
    effectId: "kata_prepare",
    image: cardImage("S0111"),
    description:
      "คาถา — เมื่อสั่งใช้งาน วางการ์ดใบนี้บนโซนเวทย์/กับดักเป็นเวทย์ต่อเนื่อง 3 เทิร์นของเรา\nทุก draw phase ของเรา หากการ์ดที่จั่วเป็นมอนสเตอร์จอมเวทย์ หรือเวทย์/กับดักที่มีชื่อ «คาถา» จั่วการ์ดเพิ่มอีก 1 ใบ",
  },
  {
    id: "S0112",
    name: "Partner Incantation",
    nameTh: "คาถาคู่หู",
    type: "spell",
    cost: 2,
    effectId: "kata_buddy",
    image: cardImage("S0112"),
    description:
      "คาถา — เลือกมอนสเตอร์จอมเวทย์บนสนามเราสูงสุด 2 ตัว นำพลังโจมตีของทั้งสองมาบวกกัน แล้วเปลี่ยนพลังโจมตีของมอนสเตอร์ทั้งสองให้เท่ากับผลรวมนั้น จนจบเทิร์น",
  },
  {
    id: "S0113",
    name: "Sorcerer Dynogr",
    nameTh: "จอมเวทย์ ไดโนกร",
    type: "monster",
    tribe: "mage",
    atk: 4,
    cost: 5,
    effectId: "dynogr_mage",
    rarity: "SR",
    image: cardImage("S0113"),
    description:
      "ตราบใดที่การ์ดใบนี้อยู่บนสนาม ค่าร่ายของเวทย์/กับดักที่มีชื่อ «คาถา» ของเราลดลง 1\nเมื่อเราเปิดใช้เวทย์/กับดักที่มีชื่อ «คาถา» การ์ดใบนี้พลังโจมตี +1",
  },
  {
    id: "S0114",
    name: "Sorcerer Saruka",
    nameTh: "จอมเวทย์ ซารุกะ",
    type: "monster",
    tribe: "mage",
    atk: 1,
    cost: 0,
    effectId: "saruka_mage",
    rarity: "SR",
    image: cardImage("S0114"),
    description:
      "เทิร์นละครั้ง: ทิ้งการ์ดจากมือ 1 ใบ แล้วนำเวทย์/กับดักที่มีชื่อ «คาถา» จากเด็คหรือสุสานขึ้นมือ\nเทิร์นละครั้ง: เมื่อเราเปิดใช้เวทย์/กับดักที่มีชื่อ «คาถา» การ์ดใบนี้ ATK +8 จนจบเทิร์นของอีกฝ่าย",
  },
  {
    id: "S0115",
    name: "Sorcerer Ryuka",
    nameTh: "จอมเวทย์ ริวกะ",
    type: "monster",
    tribe: "mage",
    atk: 2,
    cost: 2,
    effectId: "ryuka_mage",
    rarity: "SR",
    image: cardImage("S0115"),
    description:
      "เทิร์นละครั้ง: ทิ้งการ์ดจากมือ 2 ใบ นำเวทย์/กับดักที่มีชื่อ «คาถา» จากสุสานขึ้นมือ 1 ใบ — ในเทิร์นนี้หากเราเปิดใช้คาถาชื่อเดียวกับที่นำขึ้นมา ให้ทำผลของการ์ดใบนั้น 2 รอบ\nเทิร์นละครั้ง: เมื่อเราเปิดใช้เวทย์/กับดักที่มีชื่อ «คาถา» เลือกมอนสเตอร์บนสนามอีกฝ่าย 1 ตัว — การ์ดใบนั้นนอนและไม่ตื่นจนกว่าจะจบเทิร์นถัดไปของอีกฝ่าย",
  },
  {
    id: "S0116",
    name: "Hypnosis Incantation",
    nameTh: "คาถาสะกดจิต",
    type: "spell",
    cost: 3,
    effectId: "kata_hypnosis",
    image: cardImage("S0116"),
    description:
      "คาถา — เลือกมอนสเตอร์บนสนามอีกฝ่าย 2 ตัว บังคับให้ต่อสู้กัน หากการต่อสู้นั้นทำให้มอนสเตอร์ทั้งสองถูกทำลาย เราจั่วการ์ด 1 ใบ",
  },
  {
    id: "S0117",
    name: "Blink Incantation",
    nameTh: "คาถาย้ายฉับพลัน",
    type: "spell",
    cost: 3,
    effectId: "kata_blink",
    image: cardImage("S0117"),
    description:
      "คาถา — เลือกมอนสเตอร์จอมเวทย์จากเด็คหรือสุสาน 1 ใบ อัญเชิญการ์ดใบนั้นลงบนสนาม",
  },
  {
    id: "S0118",
    name: "Barrier Incantation",
    nameTh: "คาถาบาเรีย",
    type: "trap",
    cost: 2,
    effectId: "kata_barrier",
    image: cardImage("S0118"),
    description:
      "คาถา — เมื่ออีกฝ่ายโจมตีมายังมอนสเตอร์จอมเวทย์บนสนามเรา การโจมตีนั้นจะไร้ผล และลดพลังโจมตีของมอนสเตอร์จอมเวทย์ที่เป็นเป้าหมายลงครึ่งหนึ่ง",
  },
  {
    id: "S0119",
    name: "Intercept Incantation",
    nameTh: "คาถาสกัดกั้น",
    type: "trap",
    cost: 2,
    effectId: "kata_intercept",
    image: cardImage("S0119"),
    description:
      "คาถา — เมื่ออีกฝ่ายใช้งานเอฟเฟคการ์ดมอนสเตอร์ เวทย์มนต์ หรือกับดัก ขณะที่เราควบคุมมอนสเตอร์จอมเวทย์อยู่ ยกเลิกเอฟเฟคของการ์ดนั้นและทำลายทิ้ง หลังจากนั้นจอมเวทย์ทุกใบบนสนามเรา ATK +3 จนจบเทิร์น",
  },
  {
    id: "S0120",
    name: "Sorcerer Zeeka",
    nameTh: "จอมเวทย์ ซีก้า",
    type: "monster",
    tribe: "mage",
    atk: 0,
    cost: 7,
    effectId: "zeeka_mage",
    rarity: "UR",
    image: cardImage("S0120"),
    description:
      "สั่งใช้ได้เมื่อมี「คาถา」ในสุสานอย่างน้อย 3 ใบ — เทิร์นละครั้ง: การ์ดใบนี้ ATK + ตามจำนวน「คาถา」ในสุสาน (ถ้ามีมากกว่า 5 ใบ ใช้ความสามารถนี้ได้ 2 ครั้งต่อเทิร์น)\nเทิร์นละครั้ง: เมื่อเราเปิดใช้เวทย์/กับดักที่มีชื่อ「คาถา」 เลือกมอนสเตอร์ฝ่ายตรงข้าม 1 ตัว — ATK −1 × จำนวน「คาถา」ในสุสานเรา (เหลือ 0 ถูกทำลาย)",
  },
];

/** All cards with rarity assigned from strength (or explicit override). */
export const CARD_DATABASE: CardDefinition[] = CARD_DRAFTS.map(withRarity);

export { cardPowerScore, assignRarity } from "./rarity";
export type { CardDraft } from "./rarity";

export const CARD_MAP = Object.fromEntries(
  CARD_DATABASE.map((c) => [c.id, c]),
) as Record<string, CardDefinition>;

export function getCard(cardId: string): CardDefinition {
  const card = CARD_MAP[cardId];
  if (!card) throw new Error(`Unknown card: ${cardId}`);
  return card;
}

/** Starter deck grouped by tribe/type — edit `src/data/defaultDeck.json` */
export const DEFAULT_DECK_LIST: Record<string, number> = Object.assign(
  {},
  ...Object.values(defaultDeckByTribe),
);

/** Fixed CPU duel deck — swarm warriors the AI plays well (no Sora self-bomb) */
export const BOT_DECK_NAME = botDeckJson.name;
export const BOT_DECK_LIST: Record<string, number> = {
  ...botDeckJson.warrior,
  ...botDeckJson.spell,
  ...botDeckJson.trap,
};

/** Short practice decks for how-to-play (bypass MIN_DECK) */
export const TUTORIAL_DECK_NAME = tutorialDeckJson.name;
export const TUTORIAL_DECK_LIST: Record<string, number> = {
  ...tutorialDeckJson.warrior,
  ...tutorialDeckJson.spell,
  ...tutorialDeckJson.trap,
};
export const TUTORIAL_BOT_NAME = tutorialBotDeckJson.name;
export const TUTORIAL_BOT_DECK_LIST: Record<string, number> = {
  ...tutorialBotDeckJson.warrior,
  ...tutorialBotDeckJson.spell,
  ...tutorialBotDeckJson.trap,
};

export function deckListToArray(list: Record<string, number>): string[] {
  const ids: string[] = [];
  for (const [id, count] of Object.entries(list)) {
    for (let i = 0; i < count; i++) ids.push(id);
  }
  return ids;
}

export function countDeckCards(list: Record<string, number>): number {
  return Object.values(list).reduce((a, b) => a + b, 0);
}

export const MIN_DECK = 40;
export const MAX_DECK = 50;
export const MAX_COPIES = 3;
