import assert from "node:assert/strict";
import test from "node:test";
import { MIN_PLAYERS, MAX_PLAYERS, PLAYER_COLORS, PLAYER_CHARACTERS, type GameState } from "@valenor/shared";
import { RoomManager } from "./room-manager";
import { DiceService } from "./game/dice-service";

function party(count=2) {
  const values=[6,6,6,5,6,4,6,3,6,2,6,1];
  const manager=new RoomManager(new DiceService({rollDie:()=>values.shift() ?? 1}),undefined,undefined,()=>0);
  const {room}=manager.createRoom("host");
  const human=manager.joinRoom(room.code,"Phil","human");
  for(let i=1;i<count;i++)manager.addComputer(room.code,"host");
  return {manager,code:room.code,human};
}

test("central party identity has six distinct colors, eight characters and explicit two-to-six limits",()=>{
  assert.equal(MIN_PLAYERS,2);assert.equal(MAX_PLAYERS,6);
  assert.equal(new Set(PLAYER_COLORS).size,6);assert.ok(PLAYER_COLORS.includes("orange")&&PLAYER_COLORS.includes("cyan"));
  assert.equal(new Set(PLAYER_CHARACTERS.map(character=>character.id)).size,8);
});

for(const count of [2,3,4,5,6])test(`${count} players receive unique defaults and all participate in order rolls and completed rounds`,()=>{
  const {manager,code,human}=party(count);
  let room=manager.getRoom(code)!;
  assert.equal(human.player.ready,false);assert.ok(room.players.slice(1).every(player=>player.ready));
  assert.equal(new Set(room.players.map(player=>player.color)).size,count);
  assert.equal(new Set(room.players.map(player=>player.characterId)).size,count);
  manager.updatePlayerReady(code,human.player.id,true,"human");
  let state=manager.startGame(code,"host");
  assert.deepEqual(state.players.map(player=>player.characterId),room.players.map(player=>player.characterId));
  for(const player of state.players)state=manager.rollForOrder(code,player.id,player.type);
  assert.equal(state.turnOrder.length,count);assert.equal(new Set(state.turnOrder).size,count);
  const internal=manager as unknown as {rooms:Map<string,{gameState:GameState}>};
  for(let index=0;index<count;index++){
    const live=internal.rooms.get(code)!.gameState;live.turnPhase="waitingForEndTurn";
    const current=live.players.find(player=>player.id===live.currentPlayerId)!;
    manager.endTurn(code,current.id,current.type);state=manager.beginNextTurn(code);
  }
  assert.equal(state.currentRound,2);assert.equal(state.currentPlayerId,state.turnOrder[0]);
});

test("character and color selection prefer humans over NPCs, reset readiness and reject human conflicts atomically",()=>{
  const {manager,code,human}=party(6);
  manager.updatePlayerReady(code,human.player.id,true,"human");
  const npc=manager.getRoom(code)!.players[5]!;
  let room=manager.updatePlayerCharacter(code,human.player.id,npc.characterId,"human");
  assert.equal(room.players[0]!.characterId,npc.characterId);assert.equal(room.players[0]!.ready,false);
  assert.equal(new Set(room.players.map(player=>player.characterId)).size,6);
  manager.updatePlayerReady(code,human.player.id,true,"human");
  room=manager.updatePlayerColor(code,human.player.id,npc.color,"human");assert.equal(room.players[0]!.ready,false);
  assert.equal(new Set(room.players.map(player=>player.color)).size,6);
  manager.removePlayer(code,npc.id,"host");
  const other=manager.joinRoom(code,"Myrra","other");
  const before=manager.getRoom(code);
  assert.throws(()=>manager.updatePlayerCharacter(code,other.player.id,room.players[0]!.characterId,"other"),/Phil/);
  assert.throws(()=>manager.updatePlayerColor(code,other.player.id,room.players[0]!.color,"other"),/belegt/);
  assert.deepEqual(manager.getRoom(code),before);
  assert.throws(()=>manager.updatePlayerCharacter(code,human.player.id,"dragon" as "dwarf","human"),/ungültig/);
  assert.throws(()=>manager.updatePlayerCharacter(code,human.player.id,"dwarf","other"));
});

test("readiness is server validated, required for connected humans, and cleared on selection and disconnect",()=>{
  const {manager,code,human}=party();
  assert.throws(()=>manager.startGame(code,"host"),/bereit/);
  assert.throws(()=>manager.updatePlayerReady(code,human.player.id,"yes" as unknown as boolean,"human"),/ungültig/);
  assert.throws(()=>manager.updatePlayerReady(code,human.player.id,true,"intruder"));
  manager.updatePlayerReady(code,human.player.id,true,"human");
  manager.disconnectPlayer(code,human.player.id);assert.equal(manager.getRoom(code)!.players[0]!.ready,false);
  manager.joinRoom(code,"Phil","new",human.playerToken);
  assert.throws(()=>manager.startGame(code,"host"),/bereit/);
  manager.updatePlayerReady(code,human.player.id,true,"new");manager.startGame(code,"host");
  assert.throws(()=>manager.updatePlayerReady(code,human.player.id,false,"new"),/Lobby/);
  assert.throws(()=>manager.updatePlayerCharacter(code,human.player.id,"dwarf","new"),/Lobby/);
});

test("only the host removes humans and NPCs in the lobby, freeing identity and invalidating the removed token",()=>{
  const {manager,code,human}=party(6);const npc=manager.getRoom(code)!.players[1]!;
  assert.throws(()=>manager.removePlayer(code,human.player.id,"human"),/Host/);
  manager.removePlayer(code,npc.id,"host");
  const replacement=manager.joinRoom(code,"Myrra","other");
  manager.removePlayer(code,human.player.id,"host");
  const rejoined=manager.joinRoom(code,"Phil","new",human.playerToken);
  assert.equal(rejoined.reconnected,false);assert.notEqual(rejoined.player.id,human.player.id);
  manager.disconnectPlayer(code,rejoined.player.id);manager.removePlayer(code,rejoined.player.id,"host");
  manager.updatePlayerReady(code,replacement.player.id,true,"other");manager.startGame(code,"host");
  assert.throws(()=>manager.removePlayer(code,replacement.player.id,"host"),/Lobby/);
});

test("returning to the lobby retains all identities and config while discarding every game runtime",()=>{
  const {manager,code,human}=party(6);
  manager.updateConfig(code,{mode:"quick",quickGameDurationMinutes:60},"host");
  manager.updatePlayerCharacter(code,human.player.id,"nightElf","human");
  manager.updatePlayerColor(code,human.player.id,"cyan","human");
  manager.updatePlayerReady(code,human.player.id,true,"human");
  const identities=manager.getRoom(code)!.players.map(({id,name,type,color,characterId})=>({id,name,type,color,characterId}));
  manager.startGame(code,"host");
  assert.throws(()=>manager.returnToLobby(code,"human"),/Host/);
  const lobby=manager.returnToLobby(code,"host");
  assert.equal(lobby.phase,"lobby");assert.equal(lobby.gameState,undefined);
  assert.deepEqual(lobby.players.map(({id,name,type,color,characterId})=>({id,name,type,color,characterId})),identities);
  assert.ok(lobby.players.every(player=>player.ready===(player.type==="computer")));
  const internal=manager as unknown as {rooms:Map<string,{cardRuntime?:unknown}>};assert.equal(internal.rooms.get(code)!.cardRuntime,undefined);
  manager.updatePlayerReady(code,human.player.id,true,"human");const fresh=manager.startGame(code,"host");
  assert.ok(fresh.players.every(player=>player.gold===1500&&player.position===0&&!player.relics?.length&&player.activeQuests?.length===3));
  assert.deepEqual(fresh.propertyOwnerships,[]);assert.equal(fresh.weltenwegPot,0);assert.equal(fresh.decks?.adventure.drawCount,28);assert.equal(fresh.decks?.fate.drawCount,28);
  assert.equal(fresh.decks?.adventure.discardCount,0);assert.equal(fresh.decks?.fate.discardCount,0);
});
