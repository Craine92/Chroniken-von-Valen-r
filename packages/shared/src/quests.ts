export type QuestId = "traveler" | "landbuyer" | "seafarer" | "builder" | "landlord" | "dragonfriend" | "fortunehunter" | "tollpayer";
export type QuestType = "startPass" | "propertyPurchase" | "harborAcquisition" | "build" | "completeGroup" | "dragonEncounter" | "tavernWin" | "taxPaid";
export interface QuestDefinition { id: QuestId; title: string; description: string; rewardGold: number; type: QuestType; symbol: string }
export interface PlayerQuest { id: QuestId; assignedAtTurn: number }
export const MAX_ACTIVE_QUESTS = 3;
export const QUEST_DEFINITIONS: Readonly<Record<QuestId, QuestDefinition>> = {
  traveler: { id: "traveler", title: "Reisender", description: "Passiere das Runentor.", rewardGold: 100, type: "startPass", symbol: "✦" },
  landbuyer: { id: "landbuyer", title: "Landkäufer", description: "Kaufe ein Grundstück.", rewardGold: 100, type: "propertyPurchase", symbol: "⌂" },
  seafarer: { id: "seafarer", title: "Seefahrer", description: "Erwirb einen Hafen.", rewardGold: 150, type: "harborAcquisition", symbol: "⚓" },
  builder: { id: "builder", title: "Baumeister", description: "Errichte ein Bauwerk.", rewardGold: 125, type: "build", symbol: "♜" },
  landlord: { id: "landlord", title: "Landesherr", description: "Vervollständige eine Baugruppe.", rewardGold: 250, type: "completeGroup", symbol: "♛" },
  dragonfriend: { id: "dragonfriend", title: "Drachenfreund", description: "Begegne dem wandernden Drachen.", rewardGold: 150, type: "dragonEncounter", symbol: "🐉" },
  fortunehunter: { id: "fortunehunter", title: "Glücksritter", description: "Gewinne den Weltenweg-Pott.", rewardGold: 200, type: "tavernWin", symbol: "✧" },
  tollpayer: { id: "tollpayer", title: "Zollzahler", description: "Zahle Kronenzoll oder Drachenzehnt.", rewardGold: 100, type: "taxPaid", symbol: "◈" }
};
