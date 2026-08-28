(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LighthouseScene = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SYSTEM_LEVELS = Object.freeze({
    harborPath: 3,
    workshopGears: 2,
    fractionBridge: 3,
    lightReservoir: 7,
    geometryGarden: 2,
    controlConsole: 6
  });

  function clampLevel(value, maximum) {
    const level = Number(value);
    return Number.isFinite(level) ? Math.max(0, Math.min(maximum, Math.trunc(level))) : 0;
  }

  function cssName(name) {
    return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  }

  function setDataset(node, name, value) {
    const next = String(value);
    if (node.dataset[name] !== next) node.dataset[name] = next;
  }

  function setProperty(node, name, value) {
    if (!node.style) return;
    const next = String(value);
    if (node.style.getPropertyValue(name) !== next) node.style.setProperty(name, next);
  }

  function setAttribute(node, name, value) {
    const next = String(value);
    const current = node.getAttribute ? node.getAttribute(name) : node[name];
    if (current !== next) node.setAttribute(name, next);
  }

  function renderLighthouseScene(root, worldSnapshot) {
    if (!root || !worldSnapshot) return;
    const levels = Object.fromEntries(Object.entries(SYSTEM_LEVELS).map(([system, maximum]) => [
      system,
      clampLevel(worldSnapshot.restoration?.[system], maximum)
    ]));
    const harborRepaired = levels.harborPath >= 1;
    const fullyRestored = Object.entries(SYSTEM_LEVELS).every(([system, maximum]) => levels[system] === maximum);
    const lampLit = Boolean(worldSnapshot.finale?.lampLit);
    const beamSwept = Boolean(worldSnapshot.finale?.beamSwept);
    const harborAccess = root.querySelector('[data-scene-part="harbor-access"]');

    Object.entries(levels).forEach(([system, level]) => {
      setDataset(root, system, level);
      setProperty(root, `--${cssName(system)}-level`, level);
    });
    setDataset(root, 'lit', lampLit);
    setDataset(root, 'beamSwept', beamSwept);
    root.classList.toggle('has-harbor-repair', harborRepaired);
    root.classList.toggle('is-fully-restored', fullyRestored);
    root.classList.toggle('is-lit', lampLit);
    root.classList.toggle('has-swept-beam', beamSwept);
    if (harborAccess) setDataset(harborAccess, 'repaired', harborRepaired);

    const restorationStatus = fullyRestored
      ? 'усі шість систем мають видимі відновлені частини'
      : `шлях гавані ${levels.harborPath} з 3; шестерні ${levels.workshopGears} з 2; міст ${levels.fractionBridge} з 3; резервуар ${levels.lightReservoir} з 7; сад ${levels.geometryGarden} з 2; сигнали пульта ${levels.controlConsole} з 6`;
    const lightStatus = lampLit ? 'лампа світить' : 'лампа ще не світить';
    const beamStatus = beamSwept ? '; промінь завершив прохід' : '';
    setAttribute(root, 'aria-label', `Маяк: ${restorationStatus}; ${lightStatus}${beamStatus}.`);
  }

  return { SYSTEM_LEVELS, renderLighthouseScene };
});
