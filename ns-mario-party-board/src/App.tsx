import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { motion } from 'framer-motion'
import {
  Flame,
  GitBranch,
  MinusCircle,
  PlusCircle,
  Save,
  ShieldAlert,
  Trees,
  Trophy,
} from 'lucide-react'
import './App.css'
import {
  createMapTile,
  createStarterCustomMap,
  getMapValidationIssues,
  loadSavedCustomMaps,
  saveCustomMapsToStorage,
} from './boardMaps'
import {
  DEFAULT_TEAMS,
  FLAME_TOKEN_EXCHANGE_RATE,
  MAX_ROUNDS,
  TEAM_COLOR_OPTIONS,
  createGameState,
  getCurrentPlayer,
  getSpace,
  getTilePresentation,
  rankPlayers,
  trimLog,
  type BoardMap,
  type BoardSpace,
  type EditableSpaceKind,
  type GameState,
  type Player,
  type TeamSetup,
} from './game'

const createInitialMap = () => {
  const savedMaps = loadSavedCustomMaps()
  return savedMaps[0] ? structuredClone(savedMaps[0]) : createStarterCustomMap()
}

function App() {
  const [mode, setMode] = useState<'editor' | 'setup' | 'game' | 'results'>('editor')
  const [setupTeams, setSetupTeams] = useState<TeamSetup[]>(DEFAULT_TEAMS)
  const [game, setGame] = useState<GameState | null>(null)
  const [savedMaps, setSavedMaps] = useState<BoardMap[]>(() => loadSavedCustomMaps())
  const [editorMap, setEditorMap] = useState<BoardMap>(createInitialMap)
  const [selectedBoardMap, setSelectedBoardMap] = useState<BoardMap>(createInitialMap)
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>('camp')
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState('')
  const editorBoardRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    spaceId: string
    pointerId: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef<string | null>(null)

  const currentPlayer = game ? getCurrentPlayer(game) : null
  const rankedPlayers = game ? rankPlayers(game.players) : []
  const selectedSpace = editorMap.spaces.find((space) => space.id === selectedSpaceId)
  const editorIssues = getMapValidationIssues(editorMap)
  const canUseEditorMap = editorIssues.length === 0
  const savedMapIds = new Set(savedMaps.map((map) => map.id))
  const mapHasSavedVersion = savedMapIds.has(editorMap.id)
  const isSetupValid =
    setupTeams.every((team) => team.name.trim().length > 1) &&
    new Set(setupTeams.map((team) => team.color)).size === setupTeams.length

  const persistSavedMaps = (nextMaps: BoardMap[]) => {
    setSavedMaps(nextMaps)
    saveCustomMapsToStorage(nextMaps)
  }

  const updateSetupTeam = (
    teamId: string,
    updater: (team: TeamSetup) => TeamSetup,
  ) => {
    setSetupTeams((teams) =>
      teams.map((team) => (team.id === teamId ? updater(team) : team)),
    )
  }

  const updateEditorMap = (updater: (draft: BoardMap) => void) => {
    setEditorMap((current) => {
      const draft = structuredClone(current)
      updater(draft)
      return draft
    })
  }

  const commitGame = (updater: (draft: GameState) => void) => {
    if (!game) {
      return
    }

    const draft = structuredClone(game)
    updater(draft)
    setGame(draft)

    if (draft.finished) {
      setMode('results')
    }
  }

  const writeLog = (draft: GameState, message: string) => {
    draft.log = trimLog(draft.log, message)
  }

  const addEmbers = (draft: GameState, player: Player, delta: number) => {
    const previousEmbers = player.embers
    player.embers = Math.max(0, player.embers + delta)

    if (delta > 0) {
      writeLog(
        draft,
        `${player.name} gains ${delta} embers and now has ${player.embers}.`,
      )
    }

    if (delta < 0) {
      writeLog(
        draft,
        `${player.name} loses ${Math.min(previousEmbers, -delta)} embers and now has ${player.embers}.`,
      )
    }

    if (player.embers >= FLAME_TOKEN_EXCHANGE_RATE) {
      const conversions = Math.floor(player.embers / FLAME_TOKEN_EXCHANGE_RATE)
      player.embers %= FLAME_TOKEN_EXCHANGE_RATE
      player.flameTokens += conversions
      writeLog(
        draft,
        `${player.name} converts ${conversions * FLAME_TOKEN_EXCHANGE_RATE} embers into ${conversions} Flame Token${conversions > 1 ? 's' : ''}.`,
      )
    }
  }

  const resolveLanding = (draft: GameState) => {
    const player = getCurrentPlayer(draft)
    const space = getSpace(draft.boardMap, player.position)

    switch (space.kind) {
      case 'kindling': {
        addEmbers(draft, player, 3)
        draft.phase = 'awaitingAction'
        return
      }
      case 'water': {
        addEmbers(draft, player, -3)
        draft.phase = 'awaitingAction'
        return
      }
      case 'start': {
        writeLog(draft, `${player.name} is back at camp.`)
        draft.phase = 'awaitingAction'
        return
      }
      default: {
        writeLog(draft, `${player.name} lands on ${space.label}.`)
        draft.phase = 'awaitingAction'
      }
    }
  }

  const continueMovement = (draft: GameState, chosenNextId?: string) => {
    const player = getCurrentPlayer(draft)

    if (!draft.pendingMove) {
      if (!draft.roll) {
        return
      }

      draft.pendingMove = { stepsRemaining: draft.roll.total }
    }

    let nextChoice = chosenNextId

    while (draft.pendingMove.stepsRemaining > 0) {
      const currentSpace = getSpace(draft.boardMap, player.position)

      if (currentSpace.next.length > 1 && !nextChoice) {
        draft.branchChoice = {
          fromSpaceId: currentSpace.id,
          nextOptions: currentSpace.next,
        }
        draft.phase = 'choosingPath'
        return
      }

      const nextSpaceId = nextChoice ?? currentSpace.next[0]

      if (!currentSpace.next.includes(nextSpaceId)) {
        return
      }

      player.position = nextSpaceId
      draft.pendingMove.stepsRemaining -= 1
      draft.branchChoice = null
      nextChoice = undefined

      if (player.position === draft.boardMap.startSpaceId) {
        player.laps += 1
        player.flameTokens += 1
        writeLog(draft, `${player.name} completes a lap and earns 1 Flame Token.`)
      }
    }

    draft.pendingMove = null
    draft.roll = null
    resolveLanding(draft)
  }

  const startGame = () => {
    const sanitizedTeams = setupTeams.map((team) => ({
      ...team,
      name: team.name.trim(),
    }))

    const nextBoard = structuredClone(selectedBoardMap)
    const nextGame = createGameState(sanitizedTeams, nextBoard)
    setGame(nextGame)
    setMode('game')
  }

  const resetToSetup = () => {
    setGame(null)
    setMode('setup')
  }

  const performRoll = (draft: GameState, isExtraRoll: boolean) => {
    const player = getCurrentPlayer(draft)
    const base = Math.floor(Math.random() * 6) + 1
    const modifier = player.pendingRollModifier
    const total = Math.max(1, base + modifier)

    player.pendingRollModifier = 0
    draft.roll = {
      base,
      modifier,
      total,
      isExtra: isExtraRoll,
      wasDoubled: false,
    }
    draft.phase = 'postRoll'
    draft.pendingMove = null
    draft.branchChoice = null

    const rollLabel = isExtraRoll ? 'extra roll' : 'roll'
    const modifierText = modifier === 0 ? '' : ` (${modifier > 0 ? '+' : ''}${modifier})`

    writeLog(
      draft,
      `${player.name} makes a ${rollLabel}: ${base}${modifierText} = ${total}.`,
    )
  }

  const rollDice = (isExtraRoll = false) => {
    commitGame((draft) => {
      performRoll(draft, isExtraRoll)
    })
  }

  const endTurn = () => {
    commitGame((draft) => {
      if (draft.currentPlayerIndex === draft.players.length - 1) {
        if (draft.round >= draft.maxRounds) {
          draft.finished = true
          writeLog(draft, 'The final campfire round ends. Final standings are in.')
          return
        }

        draft.currentPlayerIndex = 0
        draft.round += 1
      } else {
        draft.currentPlayerIndex += 1
      }

      draft.phase = 'awaitingRoll'
      draft.roll = null
      draft.pendingMove = null
      draft.branchChoice = null

      const nextPlayer = getCurrentPlayer(draft)
      writeLog(draft, `Round ${draft.round}: ${nextPlayer.name} is up.`)
    })
  }

  const getSpaceIcon = (space: BoardSpace, boardMap: BoardMap) => {
    if (space.id === boardMap.startSpaceId) {
      return <Trees size={16} />
    }

    if (space.kind === 'kindling') {
      return <Flame size={16} />
    }

    if (space.kind === 'water') {
      return <ShieldAlert size={16} />
    }

    if (space.next.length > 1) {
      return <GitBranch size={16} />
    }

    return <Trees size={16} />
  }

  const clampPercent = (value: number) => Math.max(8, Math.min(92, value))

  const moveTileToPointer = (spaceId: string, clientX: number, clientY: number) => {
    const board = editorBoardRef.current

    if (!board) {
      return
    }

    const rect = board.getBoundingClientRect()

    if (rect.width < 1 || rect.height < 1) {
      return
    }

    const x = clampPercent(((clientX - rect.left) / rect.width) * 100)
    const y = clampPercent(((clientY - rect.top) / rect.height) * 100)

    updateEditorMap((draft) => {
      const space = draft.spaces.find((entry) => entry.id === spaceId)

      if (!space || space.id === draft.startSpaceId) {
        return
      }

      space.x = Math.round(x)
      space.y = Math.round(y)
    })
    setSaveNotice('')
  }

  const handleSpacePointerDown = (
    spaceId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (connectionSourceId) {
      return
    }

    dragStateRef.current = {
      spaceId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
    setSelectedSpaceId(spaceId)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleSpacePointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    const deltaX = Math.abs(event.clientX - dragState.startX)
    const deltaY = Math.abs(event.clientY - dragState.startY)

    if (!dragState.moved && deltaX + deltaY < 4) {
      return
    }

    dragState.moved = true
    moveTileToPointer(dragState.spaceId, event.clientX, event.clientY)
  }

  const handleSpacePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (dragState.moved) {
      suppressClickRef.current = dragState.spaceId
    }

    dragStateRef.current = null
  }

  const shouldIgnoreSpaceClick = (spaceId: string) => {
    if (suppressClickRef.current === spaceId) {
      suppressClickRef.current = null
      return true
    }

    return false
  }

  const renderBoardStage = (
    boardMap: BoardMap,
    options?: {
      occupancy?: Record<string, Player[]>
      onSpaceClick?: (spaceId: string) => void
      onSpacePointerDown?: (
        spaceId: string,
        event: ReactPointerEvent<HTMLButtonElement>,
      ) => void
      onSpacePointerMove?: (event: ReactPointerEvent<HTMLButtonElement>) => void
      onSpacePointerUp?: (event: ReactPointerEvent<HTMLButtonElement>) => void
      shouldIgnoreClick?: (spaceId: string) => boolean
      boardRef?: React.RefObject<HTMLDivElement | null>
      selectedId?: string
      connectionId?: string | null
      currentPlayerPosition?: string
    },
  ) => (
    <div
      className={`board-stage ${options?.onSpaceClick ? 'is-editor' : ''}`}
      ref={options?.boardRef}
    >
      <svg className="board-lines" viewBox="0 0 100 100" aria-hidden="true">
        {boardMap.spaces.flatMap((space) =>
          space.next.map((nextId) => {
            const nextSpace = getSpace(boardMap, nextId)
            return (
              <line
                key={`${space.id}-${nextId}`}
                x1={space.x}
                y1={space.y}
                x2={nextSpace.x}
                y2={nextSpace.y}
              />
            )
          }),
        )}
      </svg>

      {boardMap.spaces.map((space) => {
        const occupyingPlayers = options?.occupancy?.[space.id] ?? []
        const isCurrentSpace = options?.currentPlayerPosition === space.id
        const isSelected = options?.selectedId === space.id
        const isConnectionSource = options?.connectionId === space.id
        const isConnectable = Boolean(
          options?.connectionId && options.connectionId !== space.id,
        )

        return (
          <button
            type="button"
            className={`space-node kind-${space.kind} ${isCurrentSpace ? 'is-current' : ''} ${isSelected ? 'is-selected' : ''} ${isConnectionSource ? 'is-connection-source' : ''} ${isConnectable ? 'is-connectable' : ''}`}
            key={space.id}
            style={{ left: `${space.x}%`, top: `${space.y}%` }}
            onClick={() => {
              if (options?.shouldIgnoreClick?.(space.id)) {
                return
              }

              options?.onSpaceClick?.(space.id)
            }}
            onPointerDown={(event) => options?.onSpacePointerDown?.(space.id, event)}
            onPointerMove={(event) => options?.onSpacePointerMove?.(event)}
            onPointerUp={(event) => options?.onSpacePointerUp?.(event)}
            disabled={!options?.onSpaceClick}
          >
            <div className="space-icon">{getSpaceIcon(space, boardMap)}</div>
            <strong>{space.label}</strong>
            <span>{space.description}</span>

            <div className="token-stack">
              {occupyingPlayers.map((player, index) => (
                <motion.div
                  layout
                  className="token"
                  key={player.id}
                  style={{
                    backgroundColor: player.color,
                    transform: `translate(${index % 2 === 0 ? '-45%' : '10%'}, ${index < 2 ? '-35%' : '20%'})`,
                  }}
                  title={player.name}
                >
                  {player.name.slice(0, 1).toUpperCase()}
                </motion.div>
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )

  const addTile = (kind: EditableSpaceKind) => {
    const tileCount = editorMap.spaces.filter((space) => space.id !== editorMap.startSpaceId).length
    const tile = createMapTile(tileCount + 1, kind)

    updateEditorMap((draft) => {
      draft.spaces.push(tile)
    })
    setSelectedSpaceId(tile.id)
    setSaveNotice('')
  }

  const updateSelectedTile = (updater: (space: BoardSpace) => void) => {
    if (!selectedSpace || selectedSpace.id === editorMap.startSpaceId) {
      return
    }

    updateEditorMap((draft) => {
      const space = draft.spaces.find((entry) => entry.id === selectedSpace.id)

      if (!space) {
        return
      }

      updater(space)
    })
    setSaveNotice('')
  }

  const handleEditorSpaceClick = (spaceId: string) => {
    if (connectionSourceId && connectionSourceId !== spaceId) {
      updateEditorMap((draft) => {
        const source = draft.spaces.find((space) => space.id === connectionSourceId)

        if (!source) {
          return
        }

        if (source.next.includes(spaceId)) {
          source.next = source.next.filter((nextId) => nextId !== spaceId)
        } else {
          source.next.push(spaceId)
        }
      })
      setSelectedSpaceId(spaceId)
      setSaveNotice('')
      return
    }

    setSelectedSpaceId(spaceId)
  }

  const deleteSelectedTile = () => {
    if (!selectedSpace || selectedSpace.id === editorMap.startSpaceId) {
      return
    }

    updateEditorMap((draft) => {
      draft.spaces = draft.spaces.filter((space) => space.id !== selectedSpace.id)
      for (const space of draft.spaces) {
        space.next = space.next.filter((nextId) => nextId !== selectedSpace.id)
      }
    })
    setSelectedSpaceId(editorMap.startSpaceId)
    setConnectionSourceId(null)
    setSaveNotice('')
  }

  const saveCurrentMap = () => {
    const nextMap = {
      ...structuredClone(editorMap),
      name: editorMap.name.trim() || 'Custom board',
    }

    const existingIndex = savedMaps.findIndex((map) => map.id === nextMap.id)
    const nextMaps =
      existingIndex >= 0
        ? savedMaps.map((map) => (map.id === nextMap.id ? nextMap : map))
        : [...savedMaps, nextMap]

    persistSavedMaps(nextMaps)
    setEditorMap(nextMap)
    setSelectedBoardMap(nextMap)
    setSaveNotice('Map saved locally. It will be available the next time you open the app.')
  }

  const loadMapIntoEditor = (mapId: string) => {
    const match = savedMaps.find((map) => map.id === mapId)

    if (!match) {
      return
    }

    setEditorMap(structuredClone(match))
    setSelectedSpaceId(match.startSpaceId)
    setConnectionSourceId(null)
    setSaveNotice('')
  }

  const createNewMap = () => {
    const freshMap = createStarterCustomMap(`Custom board ${savedMaps.length + 1}`)
    setEditorMap(freshMap)
    setSelectedSpaceId(freshMap.startSpaceId)
    setConnectionSourceId(null)
    setSaveNotice('')
  }

  const deleteCurrentMap = () => {
    if (!mapHasSavedVersion) {
      return
    }

    const nextMaps = savedMaps.filter((map) => map.id !== editorMap.id)
    persistSavedMaps(nextMaps)

    const fallbackMap = nextMaps[0] ? structuredClone(nextMaps[0]) : createStarterCustomMap()
    setEditorMap(fallbackMap)
    setSelectedBoardMap(fallbackMap)
    setSelectedSpaceId(fallbackMap.startSpaceId)
    setConnectionSourceId(null)
    setSaveNotice('Saved map deleted.')
  }

  const boardOccupancy = game
    ? game.boardMap.spaces.reduce<Record<string, Player[]>>((accumulator, space) => {
        accumulator[space.id] = game.players.filter((player) => player.position === space.id)
        return accumulator
      }, {})
    : {}

  if (mode === 'editor') {
    return (
      <main className="app-shell game-shell">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Board builder</span>
            <h1>Build the event map first</h1>
            <p>
              Add regular, kindling, and water bucket tiles. Connect them to build the route,
              then save the board locally and carry it into team setup.
            </p>
          </div>

          <div className="hero-stats">
            <article>
              <strong>3</strong>
              <span>Tile types</span>
            </article>
            <article>
              <strong>∞</strong>
              <span>Saved maps</span>
            </article>
            <article>
              <strong>1</strong>
              <span>Camp start</span>
            </article>
          </div>
        </section>

        <section className="editor-grid">
          <article className="board-panel">
            <div className="panel-heading compact">
              <h2>{editorMap.name}</h2>
              <p>Click a node to edit it. Turn on connection mode to link one node to another.</p>
            </div>

            {renderBoardStage(editorMap, {
              onSpaceClick: handleEditorSpaceClick,
              onSpacePointerDown: handleSpacePointerDown,
              onSpacePointerMove: handleSpacePointerMove,
              onSpacePointerUp: handleSpacePointerUp,
              shouldIgnoreClick: shouldIgnoreSpaceClick,
              boardRef: editorBoardRef,
              selectedId: selectedSpaceId,
              connectionId: connectionSourceId,
            })}

            <div className="inline-actions">
              <button type="button" className="secondary-button" onClick={() => addTile('regular')}>
                <PlusCircle size={16} />
                Add regular
              </button>
              <button type="button" className="secondary-button" onClick={() => addTile('kindling')}>
                <Flame size={16} />
                Add kindling
              </button>
              <button type="button" className="secondary-button" onClick={() => addTile('water')}>
                <ShieldAlert size={16} />
                Add water bucket
              </button>
            </div>
          </article>

          <aside className="sidebar-panel">
            <article className="status-card">
              <div className="panel-heading compact">
                <h2>Map details</h2>
                <p>Save multiple layouts and reload them later.</p>
              </div>

              <label className="stack-field">
                <span className="field-label">Map name</span>
                <input
                  type="text"
                  value={editorMap.name}
                  onChange={(event) => {
                    const value = event.target.value
                    updateEditorMap((draft) => {
                      draft.name = value
                    })
                    setSaveNotice('')
                  }}
                />
              </label>

              <div className="inline-actions compact-actions">
                <button type="button" className="secondary-button" onClick={createNewMap}>
                  New map
                </button>
                <button type="button" className="secondary-button" onClick={saveCurrentMap}>
                  <Save size={16} />
                  Save map
                </button>
              </div>

              <div className="saved-map-list">
                {savedMaps.length === 0 ? (
                  <p className="muted-copy">No saved maps yet. Save this one to keep it.</p>
                ) : (
                  savedMaps.map((map) => (
                    <button
                      type="button"
                      key={map.id}
                      className={`saved-map-button ${map.id === editorMap.id ? 'is-active' : ''}`}
                      onClick={() => loadMapIntoEditor(map.id)}
                    >
                      <strong>{map.name}</strong>
                      <span>{map.spaces.length - 1} tiles</span>
                    </button>
                  ))
                )}
              </div>

              <div className="inline-actions compact-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={deleteCurrentMap}
                  disabled={!mapHasSavedVersion}
                >
                  Delete saved map
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setSelectedBoardMap(structuredClone(editorMap))
                    setMode('setup')
                  }}
                  disabled={!canUseEditorMap}
                >
                  Continue to teams
                </button>
              </div>

              {saveNotice && <p className="success-copy">{saveNotice}</p>}
            </article>

            <article className="status-card">
              <div className="panel-heading compact">
                <h2>Selected node</h2>
                <p>{selectedSpace ? selectedSpace.label : 'Choose a tile on the map.'}</p>
              </div>

              {selectedSpace ? (
                <div className="editor-controls">
                  {selectedSpace.id !== editorMap.startSpaceId ? (
                    <>
                      <label className="stack-field">
                        <span className="field-label">Tile type</span>
                        <select
                          value={selectedSpace.kind}
                          onChange={(event) => {
                            const nextKind = event.target.value as EditableSpaceKind
                            updateSelectedTile((space) => {
                              const presentation = getTilePresentation(nextKind)
                              space.kind = nextKind
                              space.label = presentation.label
                              space.description = presentation.description
                            })
                          }}
                        >
                          <option value="regular">Regular</option>
                          <option value="kindling">Kindling</option>
                          <option value="water">Water Bucket</option>
                        </select>
                      </label>

                      <p className="muted-copy">Drag this tile directly on the board to move it.</p>

                      <div className="inline-actions compact-actions">
                        <button
                          type="button"
                          className={`secondary-button ${connectionSourceId === selectedSpace.id ? 'is-toggled' : ''}`}
                          onClick={() =>
                            setConnectionSourceId((current) =>
                              current === selectedSpace.id ? null : selectedSpace.id,
                            )
                          }
                        >
                          <GitBranch size={16} />
                          {connectionSourceId === selectedSpace.id ? 'Stop connecting' : 'Connect from this tile'}
                        </button>
                        <button type="button" className="ghost-button" onClick={deleteSelectedTile}>
                          <MinusCircle size={16} />
                          Remove tile
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="choice-copy">
                      <strong>Camp</strong>
                      <span>Camp is the fixed start node. Use connection mode here to set the opening path.</span>
                      <button
                        type="button"
                        className={`secondary-button ${connectionSourceId === selectedSpace.id ? 'is-toggled' : ''}`}
                        onClick={() =>
                          setConnectionSourceId((current) =>
                            current === selectedSpace.id ? null : selectedSpace.id,
                          )
                        }
                      >
                        <GitBranch size={16} />
                        {connectionSourceId === selectedSpace.id ? 'Stop connecting' : 'Connect from Camp'}
                      </button>
                    </div>
                  )}

                  <div className="connection-list">
                    <span className="field-label">Outgoing connections</span>
                    {selectedSpace.next.length === 0 ? (
                      <p className="muted-copy">No outgoing connections yet.</p>
                    ) : (
                      selectedSpace.next.map((nextId) => {
                        const target = editorMap.spaces.find((space) => space.id === nextId)
                        return (
                          <div className="connection-chip" key={`${selectedSpace.id}-${nextId}`}>
                            <span>{target?.label ?? nextId}</span>
                            <button
                              type="button"
                              className="ghost-button small-button"
                              onClick={() => {
                                updateEditorMap((draft) => {
                                  const space = draft.spaces.find((entry) => entry.id === selectedSpace.id)

                                  if (!space) {
                                    return
                                  }

                                  space.next = space.next.filter((entry) => entry !== nextId)
                                })
                                setSaveNotice('')
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              ) : null}
            </article>

            <article className="status-card">
              <div className="panel-heading compact">
                <h2>Map checks</h2>
                <p>The game will only start on a playable loop.</p>
              </div>

              {editorIssues.length === 0 ? (
                <p className="success-copy">This board is playable. You can move on to team setup.</p>
              ) : (
                <div className="validation-list">
                  {editorIssues.map((issue) => (
                    <p key={issue}>{issue}</p>
                  ))}
                </div>
              )}
            </article>
          </aside>
        </section>
      </main>
    )
  }

  if (mode === 'setup') {
    const selectedBoardTileCount = selectedBoardMap.spaces.length - 1

    return (
      <main className="app-shell">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Team setup</span>
            <h1>{selectedBoardMap.name}</h1>
            <p>
              Your saved board is ready. Set the four team names and colors, then launch the event board.
            </p>
          </div>

          <div className="hero-stats">
            <article>
              <strong>{selectedBoardTileCount}</strong>
              <span>Tiles</span>
            </article>
            <article>
              <strong>{MAX_ROUNDS}</strong>
              <span>Rounds</span>
            </article>
            <article>
              <strong>20</strong>
              <span>Embers per Flame Token</span>
            </article>
          </div>
        </section>

        <section className="setup-panel">
          <div className="panel-heading">
            <h2>Teams</h2>
            <p>Choose names and colors. You can go back to the editor if the board still needs changes.</p>
          </div>

          <div className="setup-preview-grid">
            <div className="setup-preview-board">{renderBoardStage(selectedBoardMap)}</div>
            <div className="setup-preview-copy">
              <div className="rules-strip compact-rules">
                <article>
                  <Flame size={18} />
                  <span>Kindling: +3 embers</span>
                </article>
                <article>
                  <ShieldAlert size={18} />
                  <span>Water bucket: -3 embers</span>
                </article>
                <article>
                  <GitBranch size={18} />
                  <span>Multiple connections create branch choices</span>
                </article>
                <article>
                  <Trophy size={18} />
                  <span>Most Flame Tokens after 15 rounds wins</span>
                </article>
              </div>
            </div>
          </div>

          <div className="team-grid">
            {setupTeams.map((team, index) => (
              <article className="team-card" key={team.id}>
                <div className="team-card-head">
                  <span className="team-number">Team {index + 1}</span>
                  <span
                    className="color-chip"
                    style={{ backgroundColor: team.color }}
                    aria-hidden="true"
                  />
                </div>

                <label>
                  <span>Name</span>
                  <input
                    type="text"
                    value={team.name}
                    maxLength={20}
                    onChange={(event) =>
                      updateSetupTeam(team.id, (current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>

                <div>
                  <span className="field-label">Color</span>
                  <div className="color-grid">
                    {TEAM_COLOR_OPTIONS.map((color) => {
                      const selected = team.color === color
                      const inUseElsewhere = setupTeams.some(
                        (entry) => entry.id !== team.id && entry.color === color,
                      )

                      return (
                        <button
                          type="button"
                          key={color}
                          className={`color-option ${selected ? 'is-selected' : ''}`}
                          style={{ backgroundColor: color }}
                          onClick={() =>
                            updateSetupTeam(team.id, (current) => ({
                              ...current,
                              color,
                            }))
                          }
                          disabled={inUseElsewhere}
                          aria-label={`Choose ${color} for ${team.name}`}
                        />
                      )
                    })}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="setup-actions">
            <button type="button" className="secondary-button" onClick={() => setMode('editor')}>
              Back to board editor
            </button>
            <button type="button" className="primary-button" onClick={startGame} disabled={!isSetupValid}>
              Start event board
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (!game || !currentPlayer) {
    return null
  }

  if (mode === 'results') {
    return (
      <main className="app-shell results-shell">
        <section className="results-panel">
          <div className="panel-heading">
            <h1>{selectedBoardMap.name} results</h1>
            <p>
              {rankedPlayers[0]?.name} wins with {rankedPlayers[0]?.flameTokens} Flame Tokens.
            </p>
          </div>

          <div className="results-grid">
            {rankedPlayers.map((player, index) => (
              <article className="result-card" key={player.id}>
                <div className="result-rank">#{index + 1}</div>
                <div className="result-name-row">
                  <span className="player-dot" style={{ backgroundColor: player.color }} />
                  <h2>{player.name}</h2>
                </div>
                <div className="result-stats">
                  <span>{player.flameTokens} Flame Tokens</span>
                  <span>{player.embers} embers</span>
                  <span>{player.laps} laps</span>
                </div>
              </article>
            ))}
          </div>

          <div className="setup-actions">
            <button type="button" className="secondary-button" onClick={resetToSetup}>
              Back to setup
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setGame(createGameState(setupTeams, structuredClone(selectedBoardMap)))
                setMode('game')
              }}
            >
              Play again
            </button>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell game-shell">
      <header className="game-header">
        <div>
          <span className="eyebrow">Round {game.round} of {game.maxRounds}</span>
          <h1>{game.boardMap.name}</h1>
        </div>

        <div className="turn-badge" style={{ '--team-color': currentPlayer.color } as CSSProperties}>
          <span className="turn-label">Current team</span>
          <strong>{currentPlayer.name}</strong>
        </div>
      </header>

      <section className="game-grid">
        <article className="board-panel">
          <div className="panel-heading compact">
            <h2>Board</h2>
            <p>Roll 1d6, follow the path, and loop back to Camp for Flame Tokens.</p>
          </div>

          {renderBoardStage(game.boardMap, {
            occupancy: boardOccupancy,
            currentPlayerPosition: currentPlayer.position,
          })}
        </article>

        <aside className="sidebar-panel">
          <article className="status-card spotlight" style={{ '--team-color': currentPlayer.color } as CSSProperties}>
            <div className="panel-heading compact">
              <h2>{currentPlayer.name}</h2>
              <p>{currentPlayer.flameTokens} Flame Tokens • {currentPlayer.embers} embers • {currentPlayer.laps} laps</p>
            </div>

            {game.roll ? (
              <motion.div
                key={`${game.round}-${currentPlayer.id}-${game.roll.total}`}
                className="dice-card"
                initial={{ rotate: -8, scale: 0.9, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                transition={{ duration: 0.28 }}
              >
                <strong>{game.roll.total}</strong>
                <span>
                  Roll {game.roll.base}
                  {game.roll.modifier !== 0
                    ? ` ${game.roll.modifier > 0 ? '+' : ''}${game.roll.modifier}`
                    : ''}
                </span>
              </motion.div>
            ) : (
              <div className="dice-card is-empty">
                <strong>?</strong>
                <span>Roll the die to move.</span>
              </div>
            )}

            <div className="action-stack">
              {game.phase === 'awaitingRoll' && (
                <button type="button" className="primary-button" onClick={() => rollDice(false)}>
                  Roll 1d6
                </button>
              )}

              {game.phase === 'postRoll' && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => commitGame((draft) => continueMovement(draft))}
                >
                  Move {game.roll?.total} spaces
                </button>
              )}

              {game.phase === 'choosingPath' && game.branchChoice && (
                <div className="choice-group">
                  <div className="choice-copy">
                    <strong>Choose a route</strong>
                    <span>{getSpace(game.boardMap, game.branchChoice.fromSpaceId).description}</span>
                  </div>
                  {game.branchChoice.nextOptions.map((nextId) => {
                    const optionSpace = getSpace(game.boardMap, nextId)
                    return (
                      <button
                        type="button"
                        className="secondary-button"
                        key={nextId}
                        onClick={() => commitGame((draft) => continueMovement(draft, nextId))}
                      >
                        {optionSpace.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {game.phase === 'awaitingAction' && (
                <div className="choice-group">
                  <div className="choice-copy">
                    <strong>Turn summary</strong>
                    <span>Every {FLAME_TOKEN_EXCHANGE_RATE} embers becomes 1 Flame Token automatically.</span>
                  </div>
                  <button type="button" className="primary-button" onClick={endTurn}>
                    End turn
                  </button>
                </div>
              )}
            </div>
          </article>

          <article className="status-card">
            <div className="panel-heading compact">
              <h2>Standings</h2>
              <p>Flame Tokens first, embers as the tiebreaker.</p>
            </div>

            <div className="standings-list">
              {rankedPlayers.map((player, index) => {
                const tileKind = getSpace(game.boardMap, player.position).kind
                const tileToneClass =
                  tileKind === 'kindling'
                    ? 'is-kindling'
                    : tileKind === 'water'
                      ? 'is-water'
                      : ''

                return (
                  <div className={`standing-row ${tileToneClass}`} key={player.id}>
                    <span className="standing-rank">#{index + 1}</span>
                    <div className="standing-name">
                      <span className="player-dot" style={{ backgroundColor: player.color }} />
                      <strong>{player.name}</strong>
                    </div>
                    <span>{player.flameTokens} FT</span>
                    <span>{player.embers} embers</span>
                  </div>
                )
              })}
            </div>
          </article>

          <article className="status-card log-card">
            <div className="panel-heading compact">
              <h2>Event log</h2>
              <p>Recent actions for the facilitator.</p>
            </div>

            <div className="log-list">
              {game.log.map((entry) => (
                <p key={entry}>{entry}</p>
              ))}
            </div>
          </article>

          <div className="sidebar-actions">
            <button type="button" className="ghost-button" onClick={resetToSetup}>
              Exit to setup
            </button>
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
