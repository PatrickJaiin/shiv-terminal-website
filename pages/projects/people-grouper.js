import { useState, useEffect, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import Navbar from "../../components/Navbar";
import Footer from "../../components/Footer";

const ADMIN_PASSWORD_HASH = "2987399"; // admin password

function hashPassword(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return String(hash);
}

const GROUP_COLORS = [
  { bg: "bg-blue-50", border: "border-blue-300", text: "text-blue-700", badge: "bg-blue-100 text-blue-800", dot: "bg-blue-400" },
  { bg: "bg-green-50", border: "border-green-300", text: "text-green-700", badge: "bg-green-100 text-green-800", dot: "bg-green-400" },
  { bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-700", badge: "bg-purple-100 text-purple-800", dot: "bg-purple-400" },
  { bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-700", badge: "bg-orange-100 text-orange-800", dot: "bg-orange-400" },
  { bg: "bg-pink-50", border: "border-pink-300", text: "text-pink-700", badge: "bg-pink-100 text-pink-800", dot: "bg-pink-400" },
  { bg: "bg-teal-50", border: "border-teal-300", text: "text-teal-700", badge: "bg-teal-100 text-teal-800", dot: "bg-teal-400" },
  { bg: "bg-red-50", border: "border-red-300", text: "text-red-700", badge: "bg-red-100 text-red-800", dot: "bg-red-400" },
  { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-700", badge: "bg-yellow-100 text-yellow-800", dot: "bg-yellow-400" },
  { bg: "bg-indigo-50", border: "border-indigo-300", text: "text-indigo-700", badge: "bg-indigo-100 text-indigo-800", dot: "bg-indigo-400" },
];

const getColor = (idx) => GROUP_COLORS[idx % GROUP_COLORS.length];

export default function PeopleGrouper() {
  const [activeTab, setActiveTab] = useState("organizer");
  const nextIdRef = useRef(1);

  // ── Random Picker ──
  const [pickerNames, setPickerNames] = useState([]);
  const [pickerInput, setPickerInput] = useState("");
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  // ── Team Generator ──
  const [teamInput, setTeamInput] = useState("");
  const [teamNames, setTeamNames] = useState([]);
  const [numTeams, setNumTeams] = useState(2);
  const [teamMode, setTeamMode] = useState("byTeams");
  const [teamSize, setTeamSize] = useState(2);
  const [generatedTeams, setGeneratedTeams] = useState([]);

  // ── One-to-Many Organizer ──
  const [leftGroup, setLeftGroup] = useState([]);
  const [rightGroup, setRightGroup] = useState([]);
  const [leftInput, setLeftInput] = useState("");
  const [rightInput, setRightInput] = useState("");
  const [pairings, setPairings] = useState({});
  const [lockedPairings, setLockedPairings] = useState({});
  const [pairingHistory, setPairingHistory] = useState({});
  const [shuffleCount, setShuffleCount] = useState(0);
  const [isShuffling, setIsShuffling] = useState(false);

  // ── Board Save/Load ──
  const [boardName, setBoardName] = useState("");
  const [boardPassword, setBoardPassword] = useState("");
  const [savedBoards, setSavedBoards] = useState([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [currentPasswordHash, setCurrentPasswordHash] = useState(null);
  const [unlockInput, setUnlockInput] = useState("");
  const [loadPasswordInput, setLoadPasswordInput] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const boards = JSON.parse(localStorage.getItem("peopleGrouperBoards") || "[]");
        setSavedBoards(boards);
      } catch (e) { /* ignore */ }
    }
  }, []);

  // ══════════════════════════════════════
  // Random Picker
  // ══════════════════════════════════════
  const addPickerNames = () => {
    if (!pickerInput.trim()) return;
    const names = pickerInput.split(/[,\n]/).map(n => n.trim()).filter(Boolean);
    setPickerNames(prev => [...prev, ...names]);
    setPickerInput("");
  };

  const spinRoulette = () => {
    if (pickerNames.length === 0 || isSpinning) return;
    setIsSpinning(true);
    setSelectedPerson(null);
    const names = [...pickerNames];
    const totalSpins = 25 + Math.floor(Math.random() * 15);
    let count = 0;
    const spin = () => {
      const idx = count % names.length;
      setHighlightIndex(idx);
      count++;
      if (count >= totalSpins) {
        setSelectedPerson(names[idx]);
        setIsSpinning(false);
        return;
      }
      setTimeout(spin, Math.min(60 + Math.pow(count, 1.6) * 1.5, 400));
    };
    spin();
  };

  // ══════════════════════════════════════
  // Team Generator
  // ══════════════════════════════════════
  const addTeamNames = () => {
    if (!teamInput.trim()) return;
    const names = teamInput.split(/[,\n]/).map(n => n.trim()).filter(Boolean);
    setTeamNames(prev => [...prev, ...names]);
    setTeamInput("");
  };

  const generateTeams = () => {
    if (teamNames.length === 0) return;
    const shuffled = [...teamNames].sort(() => Math.random() - 0.5);
    const teams = [];
    if (teamMode === "byTeams") {
      for (let i = 0; i < numTeams; i++) teams.push([]);
      shuffled.forEach((name, i) => teams[i % numTeams].push(name));
    } else {
      for (let i = 0; i < shuffled.length; i += teamSize) {
        teams.push(shuffled.slice(i, i + teamSize));
      }
    }
    setGeneratedTeams(teams);
  };

  // ══════════════════════════════════════
  // One-to-Many Organizer
  // ══════════════════════════════════════
  const addLeftMembers = () => {
    if (!leftInput.trim()) return;
    const names = leftInput.split(/[,\n]/).map(n => n.trim()).filter(Boolean);
    const newMembers = names.map(name => ({ id: nextIdRef.current++, name }));
    setLeftGroup(prev => [...prev, ...newMembers]);
    setLeftInput("");
  };

  const addRightMembers = () => {
    if (!rightInput.trim()) return;
    const names = rightInput.split(/[,\n]/).map(n => n.trim()).filter(Boolean);
    const newMembers = names.map(name => ({ id: nextIdRef.current++, name }));
    setRightGroup(prev => [...prev, ...newMembers]);
    setRightInput("");
  };

  const removeLeftMember = (id) => {
    if (isLocked) return;
    const toUnlock = Object.keys(pairings).filter(rId => pairings[rId] === id);
    setLeftGroup(prev => prev.filter(m => m.id !== id));
    setPairings(prev => {
      const next = {};
      Object.entries(prev).forEach(([rId, lId]) => {
        if (lId !== id) next[rId] = lId;
      });
      return next;
    });
    if (toUnlock.length > 0) {
      setLockedPairings(prev => {
        const next = { ...prev };
        toUnlock.forEach(rId => delete next[rId]);
        return next;
      });
    }
  };

  const removeRightMember = (id) => {
    if (isLocked) return;
    setRightGroup(prev => prev.filter(m => m.id !== id));
    setPairings(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setLockedPairings(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const shufflePairings = () => {
    if (leftGroup.length === 0 || rightGroup.length === 0 || isLocked) return;
    setIsShuffling(true);

    setTimeout(() => {
      const newPairings = {};
      const leftIds = leftGroup.map(m => m.id);

      // Keep locked pairings
      Object.entries(lockedPairings).forEach(([rId]) => {
        if (pairings[rId] !== undefined && leftIds.includes(pairings[rId])) {
          newPairings[rId] = pairings[rId];
        }
      });

      // Get unlocked right members
      const unlockedRight = rightGroup.filter(r => !lockedPairings[r.id]);
      const shuffledUnlocked = [...unlockedRight].sort(() => Math.random() - 0.5);

      // Track assignment counts
      const assignCount = {};
      leftIds.forEach(id => { assignCount[id] = 0; });
      Object.values(newPairings).forEach(lId => {
        assignCount[lId] = (assignCount[lId] || 0) + 1;
      });

      // Assign each unlocked right member
      shuffledUnlocked.forEach(right => {
        const minCount = Math.min(...leftIds.map(id => assignCount[id] || 0));
        const leastLoaded = leftIds.filter(id => (assignCount[id] || 0) === minCount);

        // Among least loaded, pick the one with lowest pairing history
        const costs = leastLoaded.map(lId => ({
          leftId: lId,
          cost: pairingHistory[`r${right.id}-l${lId}`] || 0,
        }));
        const minCost = Math.min(...costs.map(c => c.cost));
        const best = costs.filter(c => c.cost === minCost);
        const chosen = best[Math.floor(Math.random() * best.length)];

        newPairings[right.id] = chosen.leftId;
        assignCount[chosen.leftId] = (assignCount[chosen.leftId] || 0) + 1;
      });

      // Update history
      const newHistory = { ...pairingHistory };
      Object.entries(newPairings).forEach(([rId, lId]) => {
        const key = `r${rId}-l${lId}`;
        newHistory[key] = (newHistory[key] || 0) + 1;
      });

      setPairings(newPairings);
      setPairingHistory(newHistory);
      setShuffleCount(prev => prev + 1);
      setIsShuffling(false);
    }, 400);
  };

  const toggleLock = (rightId) => {
    if (isLocked) return;
    if (pairings[rightId] === undefined) return;
    setLockedPairings(prev => {
      const next = { ...prev };
      if (next[rightId]) {
        delete next[rightId];
      } else {
        next[rightId] = true;
      }
      return next;
    });
  };

  const setManualPairing = (rightId, leftId) => {
    if (isLocked) return;
    setPairings(prev => ({ ...prev, [rightId]: leftId }));
  };

  const resetHistory = () => {
    setPairingHistory({});
    setShuffleCount(0);
  };

  const clearOrganizer = () => {
    setLeftGroup([]);
    setRightGroup([]);
    setPairings({});
    setLockedPairings({});
    setPairingHistory({});
    setShuffleCount(0);
    setBoardName("");
    setCurrentPasswordHash(null);
    setIsLocked(false);
  };

  // Get grouped pairings: leftId -> [rightMembers]
  const getGroupedPairings = () => {
    const grouped = {};
    leftGroup.forEach(l => { grouped[l.id] = []; });
    rightGroup.forEach(r => {
      const leftId = pairings[r.id];
      if (leftId !== undefined && grouped[leftId]) {
        grouped[leftId].push(r);
      }
    });
    return grouped;
  };

  // ══════════════════════════════════════
  // Board Save / Load
  // ══════════════════════════════════════
  const saveBoard = () => {
    if (!boardName.trim() || !boardPassword.trim()) return;
    const board = {
      name: boardName.trim(),
      passwordHash: hashPassword(boardPassword),
      leftGroup,
      rightGroup,
      pairings,
      lockedPairings,
      pairingHistory,
      shuffleCount,
      nextId: nextIdRef.current,
      savedAt: new Date().toISOString(),
    };
    const boards = JSON.parse(localStorage.getItem("peopleGrouperBoards") || "[]");
    const existingIdx = boards.findIndex(b => b.name === board.name);
    if (existingIdx >= 0) boards[existingIdx] = board;
    else boards.push(board);
    localStorage.setItem("peopleGrouperBoards", JSON.stringify(boards));
    setSavedBoards(boards);
    setCurrentPasswordHash(board.passwordHash);
    setShowSaveModal(false);
    setBoardPassword("");
  };

  const loadBoard = (board) => {
    setLeftGroup(board.leftGroup || []);
    setRightGroup(board.rightGroup || []);
    setPairings(board.pairings || {});
    setLockedPairings(board.lockedPairings || {});
    setPairingHistory(board.pairingHistory || {});
    setShuffleCount(board.shuffleCount || 0);
    setBoardName(board.name);
    setCurrentPasswordHash(board.passwordHash);
    nextIdRef.current = board.nextId || 1;
    setIsLocked(true);
    setShowLoadModal(false);
    setLoadPasswordInput("");
    setActiveTab("organizer");
  };

  const deleteBoard = (board, passwordAttempt) => {
    const hashed = hashPassword(passwordAttempt);
    if (hashed !== board.passwordHash && hashed !== ADMIN_PASSWORD_HASH) {
      alert("Incorrect password. Enter the board password or admin password to delete.");
      return;
    }
    const boards = savedBoards.filter(b => b.name !== board.name);
    localStorage.setItem("peopleGrouperBoards", JSON.stringify(boards));
    setSavedBoards(boards);
  };

  const unlockBoard = () => {
    if (!currentPasswordHash) return;
    const hashed = hashPassword(unlockInput);
    if (hashed === currentPasswordHash || hashed === ADMIN_PASSWORD_HASH) {
      setIsLocked(false);
      setUnlockInput("");
    } else {
      alert("Incorrect password");
    }
  };

  // ══════════════════════════════════════
  // Render
  // ══════════════════════════════════════
  const tabs = [
    { id: "picker", label: "Random Picker" },
    { id: "teams", label: "Team Generator" },
    { id: "organizer", label: "Organizer" },
  ];

  const hasPairings = Object.keys(pairings).length > 0;
  const grouped = getGroupedPairings();
  const leftIndexMap = {};
  leftGroup.forEach((l, i) => { leftIndexMap[l.id] = i; });

  return (
    <>
      <Head>
        <title>People Grouper - Shiv Gupta</title>
      </Head>
      <Navbar />
      <main className="pt-16 min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <Link href="/#projects" className="text-sm text-blue-600 hover:underline mb-6 inline-block">
            &larr; Back to Projects
          </Link>

          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">People Grouper</h1>
          <p className="text-gray-500 mb-8">Pick random people, generate teams, or organize one-to-many pairings with smart shuffling.</p>

          {/* Tab Bar */}
          <div className="flex gap-1 mb-8 bg-gray-200 rounded-lg p-1 w-fit">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ═══ RANDOM PICKER ═══ */}
          {activeTab === "picker" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Add People</h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pickerInput}
                    onChange={e => setPickerInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addPickerNames()}
                    placeholder="Enter names (comma separated)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button onClick={addPickerNames} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors">
                    Add
                  </button>
                </div>
                {pickerNames.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {pickerNames.map((name, i) => (
                      <span key={i} className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                        highlightIndex === i && isSpinning ? "bg-blue-500 text-white scale-110" : selectedPerson === name && !isSpinning && highlightIndex === i ? "bg-green-500 text-white scale-110 ring-4 ring-green-200" : "bg-gray-100 text-gray-700"
                      } transition-all duration-100`}>
                        {name}
                        <button onClick={() => setPickerNames(prev => prev.filter((_, j) => j !== i))} className="ml-1 text-current opacity-50 hover:opacity-100">&times;</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col items-center gap-6">
                <button
                  onClick={spinRoulette}
                  disabled={pickerNames.length === 0 || isSpinning}
                  className={`px-8 py-4 rounded-xl text-lg font-bold transition-all ${
                    isSpinning
                      ? "bg-blue-400 text-white animate-pulse cursor-not-allowed"
                      : pickerNames.length === 0
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700 hover:scale-105 shadow-lg hover:shadow-xl"
                  }`}
                >
                  {isSpinning ? "Spinning..." : "SPIN"}
                </button>

                {selectedPerson && !isSpinning && (
                  <div className="text-center animate-bounce">
                    <p className="text-sm text-gray-500 mb-2">Selected</p>
                    <div className="text-3xl font-bold text-green-600 bg-green-50 border-2 border-green-200 rounded-xl px-8 py-4">
                      {selectedPerson}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ TEAM GENERATOR ═══ */}
          {activeTab === "teams" && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Add People</h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={teamInput}
                    onChange={e => setTeamInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addTeamNames()}
                    placeholder="Enter names (comma separated)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button onClick={addTeamNames} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors">
                    Add
                  </button>
                </div>
                {teamNames.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    {teamNames.map((name, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700">
                        {name}
                        <button onClick={() => setTeamNames(prev => prev.filter((_, j) => j !== i))} className="ml-1 opacity-50 hover:opacity-100">&times;</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Settings</h2>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600">Mode:</label>
                    <select
                      value={teamMode}
                      onChange={e => setTeamMode(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="byTeams">By number of teams</option>
                      <option value="bySize">By team size</option>
                    </select>
                  </div>
                  {teamMode === "byTeams" ? (
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">Teams:</label>
                      <input
                        type="number"
                        min="1"
                        max={teamNames.length || 20}
                        value={numTeams}
                        onChange={e => setNumTeams(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">People per team:</label>
                      <input
                        type="number"
                        min="1"
                        max={teamNames.length || 20}
                        value={teamSize}
                        onChange={e => setTeamSize(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                  <button
                    onClick={generateTeams}
                    disabled={teamNames.length === 0}
                    className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    Generate Teams
                  </button>
                </div>
              </div>

              {generatedTeams.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {generatedTeams.map((team, i) => {
                    const color = getColor(i);
                    return (
                      <div key={i} className={`${color.bg} ${color.border} border rounded-xl p-4`}>
                        <h3 className={`font-semibold ${color.text} mb-3`}>Team {i + 1}</h3>
                        <ul className="space-y-1.5">
                          {team.map((name, j) => (
                            <li key={j} className="text-sm text-gray-700 flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${color.dot}`}></span>
                              {name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══ ONE-TO-MANY ORGANIZER ═══ */}
          {activeTab === "organizer" && (
            <div className="space-y-6">
              {/* Lock banner */}
              {isLocked && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
                  <span className="text-yellow-800 text-sm font-medium">Board is locked. Enter password to edit or shuffle.</span>
                  <input
                    type="password"
                    value={unlockInput}
                    onChange={e => setUnlockInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && unlockBoard()}
                    placeholder="Password"
                    className="px-3 py-1.5 border border-yellow-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  />
                  <button onClick={unlockBoard} className="px-4 py-1.5 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 transition-colors">
                    Unlock
                  </button>
                </div>
              )}

              {/* Setup Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Group */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">Left Group</h2>
                  <p className="text-xs text-gray-400 mb-4">Each person here gets paired with multiple from the right group</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={leftInput}
                      onChange={e => setLeftInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addLeftMembers()}
                      placeholder="Names (comma separated)"
                      disabled={isLocked}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                    <button onClick={addLeftMembers} disabled={isLocked} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                      Add
                    </button>
                  </div>
                  {leftGroup.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {leftGroup.map((m, i) => {
                        const color = getColor(i);
                        return (
                          <span key={m.id} className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm ${color.badge}`}>
                            <span className={`w-2 h-2 rounded-full ${color.dot}`}></span>
                            {m.name}
                            {!isLocked && (
                              <button onClick={() => removeLeftMember(m.id)} className="ml-1 opacity-50 hover:opacity-100">&times;</button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Right Group */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">Right Group</h2>
                  <p className="text-xs text-gray-400 mb-4">These people get assigned to left group members</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={rightInput}
                      onChange={e => setRightInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addRightMembers()}
                      placeholder="Names (comma separated)"
                      disabled={isLocked}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                    <button onClick={addRightMembers} disabled={isLocked} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                      Add
                    </button>
                  </div>
                  {rightGroup.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {rightGroup.map(m => (
                        <span key={m.id} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-gray-100 text-gray-700">
                          {m.name}
                          {!isLocked && (
                            <button onClick={() => removeRightMember(m.id)} className="ml-1 opacity-50 hover:opacity-100">&times;</button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={shufflePairings}
                  disabled={leftGroup.length === 0 || rightGroup.length === 0 || isLocked || isShuffling}
                  className={`px-6 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                    isShuffling
                      ? "bg-blue-400 text-white animate-pulse cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  }`}
                >
                  {isShuffling ? "Shuffling..." : hasPairings ? "Reshuffle" : "Shuffle"}
                </button>
                {shuffleCount > 0 && (
                  <span className="text-xs text-gray-400">Shuffled {shuffleCount} time{shuffleCount !== 1 ? "s" : ""}</span>
                )}
                <div className="flex-1" />
                <button onClick={resetHistory} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  Reset History
                </button>
                <button onClick={() => setShowSaveModal(true)} disabled={leftGroup.length === 0} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  Save Board
                </button>
                <button onClick={() => setShowLoadModal(true)} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  Load Board
                </button>
                <button onClick={clearOrganizer} className="px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                  Clear All
                </button>
              </div>

              {/* Pairings Result */}
              {hasPairings && (
                <div className="space-y-6">
                  {/* Grouped View */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {leftGroup.map((left, i) => {
                      const color = getColor(i);
                      const members = grouped[left.id] || [];
                      return (
                        <div key={left.id} className={`${color.bg} ${color.border} border rounded-xl overflow-hidden`}>
                          <div className={`px-4 py-3 ${color.badge} border-b ${color.border}`}>
                            <h3 className="font-semibold text-sm flex items-center gap-2">
                              <span className={`w-3 h-3 rounded-full ${color.dot}`}></span>
                              {left.name}
                              <span className="ml-auto text-xs opacity-60">{members.length} assigned</span>
                            </h3>
                          </div>
                          <ul className="p-4 space-y-2">
                            {members.length === 0 ? (
                              <li className="text-xs text-gray-400 italic">No one assigned</li>
                            ) : (
                              members.map(r => (
                                <li key={r.id} className="text-sm text-gray-700 flex items-center gap-2">
                                  <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`}></span>
                                  {r.name}
                                  {lockedPairings[r.id] && (
                                    <span className="text-xs text-yellow-600 ml-auto" title="Locked">locked</span>
                                  )}
                                </li>
                              ))
                            )}
                          </ul>
                        </div>
                      );
                    })}
                  </div>

                  {/* Preferences / Lock Controls */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Preferences &amp; Locks</h3>
                    <p className="text-xs text-gray-400 mb-4">Set a preferred pairing for right group members and lock it in. Locked pairings are preserved during shuffles.</p>
                    <div className="space-y-2">
                      {rightGroup.map(r => {
                        const currentLeft = pairings[r.id];
                        const currentLeftMember = leftGroup.find(l => l.id === currentLeft);
                        const isThisLocked = !!lockedPairings[r.id];
                        const leftIdx = currentLeftMember ? leftIndexMap[currentLeftMember.id] : -1;
                        const color = leftIdx >= 0 ? getColor(leftIdx) : null;
                        return (
                          <div key={r.id} className={`flex items-center gap-3 p-3 rounded-lg ${isThisLocked ? "bg-yellow-50 border border-yellow-200" : "bg-gray-50"}`}>
                            <span className="text-sm font-medium text-gray-700 min-w-[100px]">{r.name}</span>
                            <span className="text-gray-400 text-xs">paired with</span>
                            <select
                              value={currentLeft !== undefined ? currentLeft : ""}
                              onChange={e => setManualPairing(r.id, parseInt(e.target.value))}
                              disabled={isLocked}
                              className={`px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                color ? `${color.border}` : "border-gray-300"
                              } disabled:bg-gray-100 disabled:cursor-not-allowed`}
                            >
                              <option value="" disabled>Select...</option>
                              {leftGroup.map((l, li) => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                            </select>
                            {color && (
                              <span className={`w-3 h-3 rounded-full ${color.dot}`}></span>
                            )}
                            <button
                              onClick={() => toggleLock(r.id)}
                              disabled={isLocked || currentLeft === undefined}
                              className={`ml-auto px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                isThisLocked
                                  ? "bg-yellow-200 text-yellow-800 hover:bg-yellow-300"
                                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {isThisLocked ? "Unlock" : "Lock"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!hasPairings && leftGroup.length > 0 && rightGroup.length > 0 && (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg mb-2">Ready to shuffle</p>
                  <p className="text-sm">Click Shuffle to create pairings between the two groups</p>
                </div>
              )}
              {(leftGroup.length === 0 || rightGroup.length === 0) && (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-lg mb-2">Add people to both groups to get started</p>
                  <p className="text-sm">Left group members will each be paired with multiple right group members</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />

      {/* ═══ SAVE MODAL ═══ */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Save Board</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Board Name</label>
                <input
                  type="text"
                  value={boardName}
                  onChange={e => setBoardName(e.target.value)}
                  placeholder="My Board"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Password (required to edit/shuffle later)</label>
                <input
                  type="password"
                  value={boardPassword}
                  onChange={e => setBoardPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && saveBoard()}
                  placeholder="Enter a password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={() => { setShowSaveModal(false); setBoardPassword(""); }} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={saveBoard}
                  disabled={!boardName.trim() || !boardPassword.trim()}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ LOAD MODAL ═══ */}
      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Load Board</h3>
            {savedBoards.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">No saved boards yet.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
                {savedBoards.map(board => (
                  <div key={board.name} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900 text-sm">{board.name}</h4>
                      <span className="text-xs text-gray-400">{new Date(board.savedAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-gray-500 mb-3">
                      {(board.leftGroup || []).length} left &middot; {(board.rightGroup || []).length} right &middot; {board.shuffleCount || 0} shuffles
                    </p>
                    <div className="flex gap-2 items-center">
                      <button onClick={() => loadBoard(board)} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
                        View
                      </button>
                      <div className="flex-1" />
                      <input
                        type="password"
                        placeholder="Password to delete"
                        value={loadPasswordInput}
                        onChange={e => setLoadPasswordInput(e.target.value)}
                        className="w-36 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <button onClick={() => deleteBoard(board, loadPasswordInput)} className="px-3 py-1.5 text-red-600 border border-red-200 text-sm rounded-lg hover:bg-red-50 transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button onClick={() => { setShowLoadModal(false); setLoadPasswordInput(""); }} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
