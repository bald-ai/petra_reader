"use client"

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { useAction } from "convex/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronLeft, Link2, Loader2, MoreVertical, X } from "lucide-react"
import { api } from "@convex/_generated/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useOnline } from "@/hooks/use-online"

export interface Paragraph {
  id: number
  spanish: string
  english: string
  isPlaceholder?: boolean
}

type WordDefinition = {
  word: string
  type: string
  translation: string
  definitions: {
    spanish: string
    related: string[]
    examples: string[]
  }
  translations: {
    main: string
    alternatives: Array<{
      word: string
      type: string
      meanings: string[]
    }>
  }
}

const MAX_VISIBLE_TRANSLATIONS = 5
const LOAD_MORE_THRESHOLD = 4
const MAX_WORD_TRANSLATION_CACHE_SIZE = 100
const DEFAULT_FONT_SIZE = 14
const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 24

const clampFontSize = (size: number) => Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size))
const FONT_SIZE_OPTIONS = [-2, -1, 0, 1, 2].map((offset) => clampFontSize(DEFAULT_FONT_SIZE + offset))

export const defaultParagraphs: Paragraph[] = [
  {
    id: 1,
    spanish:
      "También estaba solo. Tragué, con un chasquido en la garganta, y traté de mantener la calma mientras repasaba los hechos. Uno: había habido un incidente en la base. Dos: la última vez que estuve consciente, estaba atrapado en una celda con Wyn el Soul Eater, sin poder salir.",
    english:
      "I was also alone. I swallowed, with a click in my throat, and tried to stay calm while going over the facts. One: there had been an incident at the base. Two: the last time I was aware, I was trapped in a cell with Wyn the Soul Eater, unable to escape.",
  },
  {
    id: 2,
    spanish:
      "Tres: ahora estaba en una habitación de motel, así que definitivamente estaba fuera de la base. Cuatro: estaba vivo, así que Wyn no me había matado. Otra vez.",
    english:
      "Three: I was now in a motel room, so I was definitely out of the base. Four: I was alive, so Wyn hadn't killed me. Again.",
  },
  {
    id: 3,
    spanish:
      "Eso significaba que alguien debía haberme sacado de la celda de Wyn después de resolver el incidente. Tal vez la base había sido comprometida y todos habíamos sido trasladados mientras se resolvía. Ese parecía el escenario más probable.",
    english:
      "That meant someone must have gotten me out of Wyn's cell after resolving the incident. Maybe the base had been compromised and we had all been relocated while it was being resolved. That seemed like the most likely scenario.",
  },
  {
    id: 4,
    spanish:
      "La habitación olía a detergente barato y a metal oxidado. Las cortinas estaban descosidas y el aire acondicionado lanzaba suspiros irregulares, como si también estuviera atrapado conmigo.",
    english:
      "The room smelled of cheap detergent and rusted metal. The curtains were frayed and the air conditioner let out irregular sighs, as if it were trapped with me.",
  },
  {
    id: 5,
    spanish:
      "Había una nota arrugada en la mesita de noche, escrita con una tinta azul que se corría. Decía: \"Quédate quieto hasta que anochezca. No confíes en nadie con ojos grises.\"",
    english:
      "There was a crumpled note on the nightstand, written in smeared blue ink. It read, \"Stay still until nightfall. Trust no one with gray eyes.\"",
  },
  {
    id: 6,
    spanish:
      "Cuando abrí la puerta, la noche todavía no había llegado, pero el sol estaba por rendirse. El estacionamiento vacío reflejaba el cielo púrpura y no había señales de vehículos oficiales.",
    english:
      "When I opened the door, night had not yet arrived, but the sun was about to give up. The empty parking lot reflected the purple sky and there were no signs of official vehicles.",
  },
  {
    id: 7,
    spanish:
      "El pasillo se extendía con alfombra húmeda, y cada puerta estaba cerrada con doble seguro. Imaginé a otros huéspedes conteniendo la respiración, esperando su propio rescate.",
    english:
      "The hallway stretched out with damp carpet, and every door was locked twice. I imagined other guests holding their breath, waiting for their own rescue.",
  },
  {
    id: 8,
    spanish:
      "En la recepción encontré a un adolescente que veía videos en su teléfono. No levantó la vista hasta que toqué la campana oxidada, y aun así tardó en reconocer mi existencia.",
    english:
      "At the front desk I found a teenager watching videos on his phone. He did not look up until I tapped the rusty bell, and even then he took his time acknowledging my existence.",
  },
  {
    id: 9,
    spanish:
      "La autopista seguía detrás del motel como un río negro. Decidí caminar hasta la gasolinera más cercana buscando cobertura, pero la señal estaba muerta.",
    english:
      "The highway ran behind the motel like a black river. I decided to walk to the nearest gas station in search of coverage, but the signal was dead.",
  },
  {
    id: 10,
    spanish:
      "Avancé sin un plan, sintiendo que cada paso me alejaba de Wyn pero también de cualquier ayuda. Nadie sabía dónde estaba, y si lo sabían, no habían dejado pistas claras.",
    english:
      "I moved forward without a plan, feeling that each step took me farther from Wyn but also from any help. No one knew where I was, and if they did, they had not left any clear clues.",
  },
  {
    id: 11,
    spanish:
      "Wyn podía aparecer en cualquier sombra prolongada; lo había visto hacerlo antes. La idea de que pudiera haberme dejado ir por pura diversión me helaba la sangre.",
    english:
      "Wyn could appear in any stretched shadow; I had seen him do it before. The thought that he might have let me go purely for fun froze my blood.",
  },
  {
    id: 12,
    spanish:
      "La base debía de estar en cuarentena. Si intentaba volver sin autorización, las defensas automáticas me derribarían antes de cruzar el perímetro.",
    english:
      "The base had to be under quarantine. If I tried to return without authorization, the automated defenses would take me down before I crossed the perimeter.",
  },
  {
    id: 13,
    spanish:
      "Seguí el sonido distante de una radio hasta encontrar un taller abandonado. Dentro había restos de comidas recientes, lo que significaba que alguien más usaba ese lugar.",
    english:
      "I followed the distant sound of a radio until I found an abandoned workshop. Inside there were remnants of recent meals, which meant someone else was using the place.",
  },
  {
    id: 14,
    spanish:
      "En una mesa de trabajo vi un mapa marcado con círculos rojos alrededor de la ciudad. Uno de ellos coincidía con la ubicación del motel; otro señalaba la presa al norte.",
    english:
      "On a workbench I saw a map marked with red circles around the city. One of them matched the motel's location; another pointed to the dam to the north.",
  },
  {
    id: 15,
    spanish:
      "Las coordenadas apuntaban a una cavidad bajo la presa, un viejo refugio que usábamos en misiones clandestinas. Si alguien de la base me había sacado, tal vez me esperaba allí.",
    english:
      "The coordinates pointed to a cavity beneath the dam, an old shelter we used during covert missions. If someone from the base had taken me out, maybe they were waiting for me there.",
  },
  {
    id: 16,
    spanish:
      "El viaje en autobús hasta la presa tomó dos horas, más que suficientes para repasar cada decisión que me había traído aquí. No llevaba armas, ni credenciales, solo mi memoria fallida.",
    english:
      "The bus ride to the dam took two hours, more than enough time to go over every decision that had brought me here. I carried no weapons, no credentials, only my faulty memory.",
  },
  {
    id: 17,
    spanish:
      "A medianoche el conductor apagó las luces interiores y el paisaje se volvió una sucesión de siluetas dentadas. Conté los postes de luz para saber dónde bajar sin llamar la atención.",
    english:
      "At midnight the driver turned off the interior lights and the landscape became a succession of jagged silhouettes. I counted the lamp posts to know where to get off without drawing attention.",
  },
  {
    id: 18,
    spanish:
      "La estación estaba desierta, salvo por un perro que cuidaba el silencio. Cuando el autobús se alejó, el animal me siguió como si supiera mi destino.",
    english:
      "The station was deserted, except for a dog guarding the silence. When the bus pulled away, the animal followed me as if it knew my destination.",
  },
  {
    id: 19,
    spanish:
      "Me escondí tras los pilares de hormigón y bajé por una escalera de mantenimiento que apenas recordaba. El aire era húmedo, cargado con el zumbido de generadores ocultos.",
    english:
      "I hid behind the concrete pillars and went down a maintenance staircase I barely remembered. The air was humid, charged with the hum of hidden generators.",
  },
  {
    id: 20,
    spanish:
      "Cuando el amanecer tiñó de naranja la presa, vi una silueta esperándome al final del túnel. No era Wyn, pero llevaba su insignia: una máscara grabada con runas que brillaban débilmente.",
    english:
      "When dawn stained the dam orange, I saw a silhouette waiting for me at the end of the tunnel. It was not Wyn, but it wore his insignia: a mask etched with runes that glowed faintly.",
  },
]

const sampleDefinitions: Record<string, WordDefinition> = {
  También: {
    word: "También",
    type: "adverb",
    translation: "Also",
    definitions: {
      spanish:
        "Usado para indicar la igualdad, semejanza, conformidad o relación de una cosa con otra ya nombrada.",
      related: ["asimismo", "igualmente"],
      examples: ["Tanto o así."],
    },
    translations: {
      main: "Also",
      alternatives: [
        {
          word: "también",
          type: "adverb",
          meanings: ["also", "también, además, ítem"],
        },
        {
          word: "too",
          type: "adverb",
          meanings: ["también, demasiado, muy, además, por otra parte"],
        },
        {
          word: "as well",
          type: "adverb",
          meanings: ["también"],
        },
      ],
    },
  },
  sacado: {
    word: "sacado",
    type: "verb",
    translation: "Taken",
    definitions: {
      spanish: "Participio pasado del verbo sacar. Extraer o hacer salir algo de donde está.",
      related: ["extraído", "retirado"],
      examples: ["He sacado el libro de la biblioteca."],
    },
    translations: {
      main: "Taken",
      alternatives: [
        {
          word: "sacado",
          type: "verb (past participle)",
          meanings: ["taken out", "extracted", "removed"],
        },
        {
          word: "sacar",
          type: "verb (infinitive)",
          meanings: ["to take out", "to extract", "to remove"],
        },
      ],
    },
  },
}

type WordTranslationResult = {
  word: string
  translation: string
}

type LanguageReaderProps = {
  title?: string
  subtitle?: string | null
  paragraphs?: Paragraph[]
  hasMore?: boolean
  isInitialLoading?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
  onBack?: () => void
  onVisibleRangeChange?: (range: { startIndex: number; endIndex: number }) => void
  initialScrollToParagraphId?: number | null
}

export default function LanguageReader({
  title,
  subtitle,
  paragraphs = defaultParagraphs,
  hasMore = false,
  isInitialLoading = false,
  isLoadingMore = false,
  onLoadMore,
  onBack,
  onVisibleRangeChange,
  initialScrollToParagraphId,
}: LanguageReaderProps) {
  const [visibleTranslations, setVisibleTranslations] = useState<Set<number>>(new Set())
  const [translations, setTranslations] = useState<Record<number, string>>({})
  const [translationErrors, setTranslationErrors] = useState<Record<number, string>>({})
  const [loadingTranslations, setLoadingTranslations] = useState<Set<number>>(new Set())
  const [activeWord, setActiveWord] = useState<string | null>(null)
  const [wordTranslationResult, setWordTranslationResult] = useState<WordTranslationResult | null>(null)
  const [wordTranslationError, setWordTranslationError] = useState<string | null>(null)
  const [isWordTranslationLoading, setIsWordTranslationLoading] = useState(false)
  const [isWordBarVisible, setIsWordBarVisible] = useState(false)
  const [isWordBarExpanded, setIsWordBarExpanded] = useState(false)
  const [wordDefinition, setWordDefinition] = useState<string | null>(null)
  const [isWordDefinitionLoading, setIsWordDefinitionLoading] = useState(false)
  const [wordDefinitionError, setWordDefinitionError] = useState<string | null>(null)
  const [readerFontSize, setReaderFontSize] = useState(DEFAULT_FONT_SIZE)
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false)
  const [isHeaderHidden, setIsHeaderHidden] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(56)
  const wordTranslationsCacheRef = useRef<Map<string, WordTranslationResult>>(new Map())
  const wordTranslationRequestIdRef = useRef(0)
  const wordDefinitionRequestIdRef = useRef(0)
  const paragraphTranslationRequestIdsRef = useRef(new Map<number, number>())
  const isMountedRef = useRef(true)
  const visibleRangeRef = useRef<{ startIndex: number; endIndex: number } | null>(null)
  const translateParagraphAction = useAction(api.translations.translateParagraph)
  const translateWordAction = useAction(api.translations.translateWord)
  const lookupWordDefinitionAction = useAction(api.translations.lookupWordDefinition)
  const headerRef = useRef<HTMLElement | null>(null)
  const fontMenuRef = useRef<HTMLDivElement | null>(null)
  const scrollParentRef = useRef<HTMLDivElement | null>(null)
  const lastScrollTopRef = useRef(0)
  const lastHideScrollTopRef = useRef(0)
  const online = useOnline()

  const rowVirtualizer = useVirtualizer({
    count: paragraphs.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 200,
    overscan: 8,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  useLayoutEffect(() => {
    const measureHeader = () => {
      if (!headerRef.current) {
        return
      }
      setHeaderHeight(headerRef.current.offsetHeight)
    }
    measureHeader()
    window.addEventListener("resize", measureHeader)
    return () => {
      window.removeEventListener("resize", measureHeader)
    }
  }, [])

  useEffect(() => {
    const scrollElement = scrollParentRef.current
    if (!scrollElement) {
      return
    }
    lastScrollTopRef.current = scrollElement.scrollTop
    const handleScroll = () => {
      const currentTop = scrollElement.scrollTop
      const lastTop = lastScrollTopRef.current
      const delta = Math.abs(currentTop - lastTop)
      if (delta < 4) {
        return
      }
      const hideThreshold = headerHeight || 48
      const showBuffer = 36
      if (currentTop <= 4) {
        if (isHeaderHidden) {
          setIsHeaderHidden(false)
        }
        lastHideScrollTopRef.current = 0
      } else if (currentTop > lastTop && currentTop > hideThreshold) {
        if (!isHeaderHidden) {
          setIsHeaderHidden(true)
          lastHideScrollTopRef.current = currentTop
        } else {
          lastHideScrollTopRef.current = Math.max(lastHideScrollTopRef.current, currentTop)
        }
      } else if (currentTop < lastTop) {
        if (isHeaderHidden) {
          const revealPosition = Math.max(0, lastHideScrollTopRef.current - showBuffer)
          if (currentTop <= revealPosition) {
            setIsHeaderHidden(false)
          }
        }
      }
      lastScrollTopRef.current = Math.max(currentTop, 0)
    }
    scrollElement.addEventListener("scroll", handleScroll)
    return () => {
      scrollElement.removeEventListener("scroll", handleScroll)
    }
  }, [headerHeight, isHeaderHidden])

  useEffect(() => {
    if (!isFontMenuOpen) {
      return
    }
    const handleClick = (event: MouseEvent) => {
      if (!fontMenuRef.current) {
        return
      }
      if (!fontMenuRef.current.contains(event.target as Node)) {
        setIsFontMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFontMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isFontMenuOpen])

  useEffect(() => {
    if (isHeaderHidden) {
      setIsFontMenuOpen(false)
    }
  }, [isHeaderHidden])

  useEffect(() => {
    isMountedRef.current = true
    const cacheRef = wordTranslationsCacheRef.current
    const paragraphRequestMap = paragraphTranslationRequestIdsRef.current
    return () => {
      isMountedRef.current = false
      cacheRef.clear()
      paragraphRequestMap.clear()
    }
  }, [])

  useEffect(() => {
    if (!hasMore || !onLoadMore || isLoadingMore) {
      return
    }
    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem) {
      return
    }
    if (lastItem.index >= paragraphs.length - LOAD_MORE_THRESHOLD) {
      onLoadMore()
    }
  }, [virtualItems, paragraphs.length, hasMore, onLoadMore, isLoadingMore])

  useEffect(() => {
    if (!onVisibleRangeChange || virtualItems.length === 0) {
      return
    }
    const first = virtualItems[0]
    const last = virtualItems[virtualItems.length - 1]
    if (!first || !last) {
      return
    }
    const nextRange = { startIndex: first.index, endIndex: last.index }
    const prev = visibleRangeRef.current
    if (!prev || prev.startIndex !== nextRange.startIndex || prev.endIndex !== nextRange.endIndex) {
      visibleRangeRef.current = nextRange
      onVisibleRangeChange(nextRange)
    }
  }, [virtualItems, onVisibleRangeChange])

  const hasScrolledToInitialRef = useRef(false)
  const initialScrollToParagraphIdRef = useRef<number | null>(null)
  
  // Track the initial scroll target - only set once when prop first becomes available
  useEffect(() => {
    if (initialScrollToParagraphId && !initialScrollToParagraphIdRef.current) {
      initialScrollToParagraphIdRef.current = initialScrollToParagraphId
    }
  }, [initialScrollToParagraphId])
  
  useEffect(() => {
    const targetParagraphId = initialScrollToParagraphIdRef.current
    if (!targetParagraphId || hasScrolledToInitialRef.current || paragraphs.length === 0 || isInitialLoading) {
      return
    }
    
    // Find the index of the paragraph with the matching ID
    const targetIndex = paragraphs.findIndex((p) => p.id === targetParagraphId && !p.isPlaceholder)
    if (targetIndex >= 0) {
      hasScrolledToInitialRef.current = true
      // Use multiple requestAnimationFrame calls to ensure the virtualizer has fully rendered and measured
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            try {
              rowVirtualizer.scrollToIndex(targetIndex, {
                align: "start",
                behavior: "auto",
              })
            } catch (error) {
              console.warn("Failed to scroll to initial position:", error)
            }
          }, 100)
        })
      })
    }
    // Don't mark as attempted if paragraph not found yet - it might still be loading
    // Only mark as attempted if we've waited a reasonable amount and still can't find it
  }, [paragraphs, isInitialLoading, rowVirtualizer])

  const fetchWordDefinition = useCallback(async (word: string) => {
    if (!word) {
      return
    }

    if (!online) {
      setWordDefinitionError("Offline — definitions resume when you reconnect.")
      setIsWordDefinitionLoading(false)
      return
    }

    wordDefinitionRequestIdRef.current += 1
    const requestId = wordDefinitionRequestIdRef.current

    setWordDefinitionError(null)
    setIsWordDefinitionLoading(true)

    try {
      const result = await lookupWordDefinitionAction({ word })
      if (!isMountedRef.current || wordDefinitionRequestIdRef.current !== requestId) {
        return
      }
      setWordDefinition(result.definition)
    } catch (error) {
      if (!isMountedRef.current || wordDefinitionRequestIdRef.current !== requestId) {
        return
      }
      const message =
        error instanceof Error ? error.message : "Unable to fetch definition right now."
      setWordDefinitionError(message)
      setWordDefinition(null)
    } finally {
      if (isMountedRef.current && wordDefinitionRequestIdRef.current === requestId) {
        setIsWordDefinitionLoading(false)
      }
    }
  }, [lookupWordDefinitionAction, online])

  const fetchWordTranslation = useCallback(async (word: string) => {
    if (!word) {
      return
    }

    wordTranslationRequestIdRef.current += 1
    const requestId = wordTranslationRequestIdRef.current

    const normalizedKey = word.toLowerCase()
    const cache = wordTranslationsCacheRef.current
    const cached = cache.get(normalizedKey)
    setWordTranslationError(null)

    if (cached) {
      cache.delete(normalizedKey)
      cache.set(normalizedKey, cached)
      if (isMountedRef.current && wordTranslationRequestIdRef.current === requestId) {
        setIsWordTranslationLoading(false)
        setWordTranslationResult(cached)
        if (!wordDefinition) {
          void fetchWordDefinition(word)
        }
      }
      return
    }

    if (!online) {
      if (isMountedRef.current && wordTranslationRequestIdRef.current === requestId) {
        setWordTranslationResult(null)
        setIsWordTranslationLoading(false)
        setWordTranslationError("Offline — word lookups resume when you reconnect.")
      }
      return
    }

    setWordTranslationResult(null)
    setIsWordTranslationLoading(true)

    try {
      const result = await translateWordAction({ word })
      const payload: WordTranslationResult = {
        word: result.word,
        translation: result.translation,
      }

      if (!isMountedRef.current || wordTranslationRequestIdRef.current !== requestId) {
        return
      }

      cache.set(normalizedKey, payload)
      if (cache.size > MAX_WORD_TRANSLATION_CACHE_SIZE) {
        const oldestKey = cache.keys().next().value
        if (oldestKey) {
          cache.delete(oldestKey)
        }
      }
      setWordTranslationResult(payload)

      void fetchWordDefinition(word)
    } catch (error) {
      if (!isMountedRef.current || wordTranslationRequestIdRef.current !== requestId) {
        return
      }
      const message =
        error instanceof Error ? error.message : "Unable to translate this word right now."
      setWordTranslationError(message)
    } finally {
      if (isMountedRef.current && wordTranslationRequestIdRef.current === requestId) {
        setIsWordTranslationLoading(false)
      }
    }
  }, [wordDefinition, translateWordAction, fetchWordDefinition, online])

  const ensureTranslation = useCallback(async (paragraph: Paragraph) => {
    if (
      paragraph.isPlaceholder ||
      translations[paragraph.id] ||
      translationErrors[paragraph.id] ||
      loadingTranslations.has(paragraph.id)
    ) {
      return
    }

    if (!online) {
      setTranslationErrors((prev) => ({
        ...prev,
        [paragraph.id]: "Offline — translations resume when you reconnect.",
      }))
      return
    }

    setLoadingTranslations((prev) => {
      const updated = new Set(prev)
      updated.add(paragraph.id)
      return updated
    })
    setTranslationErrors((prev) => {
      const { [paragraph.id]: _removed, ...rest } = prev
      void _removed
      return rest
    })

    const nextRequestId = (paragraphTranslationRequestIdsRef.current.get(paragraph.id) ?? 0) + 1
    paragraphTranslationRequestIdsRef.current.set(paragraph.id, nextRequestId)

    try {
      const result = await translateParagraphAction({
        text: paragraph.spanish,
      })
      if (!isMountedRef.current || paragraphTranslationRequestIdsRef.current.get(paragraph.id) !== nextRequestId) {
        return
      }
      setTranslations((prev) => ({
        ...prev,
        [paragraph.id]: result.translatedText,
      }))
    } catch (error) {
      if (!isMountedRef.current || paragraphTranslationRequestIdsRef.current.get(paragraph.id) !== nextRequestId) {
        return
      }
      const message =
        error instanceof Error ? error.message : "An unexpected error prevented translating this paragraph."
      setTranslationErrors((prev) => ({
        ...prev,
        [paragraph.id]: message,
      }))
    } finally {
      if (isMountedRef.current && paragraphTranslationRequestIdsRef.current.get(paragraph.id) === nextRequestId) {
        paragraphTranslationRequestIdsRef.current.delete(paragraph.id)
        setLoadingTranslations((prev) => {
          const updated = new Set(prev)
          updated.delete(paragraph.id)
          return updated
        })
      }
    }
  }, [translations, translationErrors, loadingTranslations, translateParagraphAction, online])

  const handleParagraphClick = useCallback((paragraph: Paragraph) => {
    if (paragraph.isPlaceholder) {
      return
    }
    setVisibleTranslations((prev) => {
      const updated = new Set(prev)

      const dropTranslation = (id: number) => {
        updated.delete(id)
        setTranslations((prevTranslations) => {
          const { [id]: _removed, ...rest } = prevTranslations
          void _removed
          return rest
        })
        setTranslationErrors((prevErrors) => {
          const { [id]: _removed, ...rest } = prevErrors
          void _removed
          return rest
        })
        setLoadingTranslations((prevLoading) => {
          const next = new Set(prevLoading)
          next.delete(id)
          return next
        })
      }

      if (updated.has(paragraph.id)) {
        dropTranslation(paragraph.id)
        return updated
      }

      if (updated.size >= MAX_VISIBLE_TRANSLATIONS) {
        const oldest = updated.values().next().value
        if (typeof oldest === "number") {
          dropTranslation(oldest)
        }
      }

      updated.add(paragraph.id)
      void ensureTranslation(paragraph)
      return updated
    })
  }, [ensureTranslation])

  const handleWordClick = useCallback((word: string) => {
    const cleanWord = word.replace(/[.,;:!?"""¿¡]/g, "")
    if (!cleanWord) {
      return
    }

    setActiveWord(cleanWord)
    setIsWordBarVisible(true)
    setIsWordBarExpanded(false)
    setWordDefinition(null)
    setWordDefinitionError(null)
    void fetchWordTranslation(cleanWord)
  }, [fetchWordTranslation])

  const extractWordFromClick = useCallback((event: React.MouseEvent<HTMLElement>, text: string) => {
    // Get the text node and character offset at click position
    const range = document.caretRangeFromPoint?.(event.clientX, event.clientY)
    
    if (!range) {
      // Fallback: try to get selection
      const selection = window.getSelection()
      if (selection && selection.rangeCount > 0) {
        const selRange = selection.getRangeAt(0)
        if (selRange.startContainer.nodeType === Node.TEXT_NODE) {
          const textNode = selRange.startContainer as Text
          const offset = selRange.startOffset
          const textContent = textNode.textContent || text
          
          // Find word boundaries around the offset
          let start = offset
          let end = offset
          
          // Move start backwards to word boundary (non-whitespace)
          while (start > 0 && /\S/.test(textContent[start - 1])) {
            start--
          }
          
          // Move end forwards to word boundary
          while (end < textContent.length && /\S/.test(textContent[end])) {
            end++
          }
          
          const word = textContent.slice(start, end).trim()
          return word ? word.replace(/[.,;:!?"""¿¡]/g, "") : null
        }
      }
      return null
    }
    
    // Use range to find the character position
    const textNode = range.startContainer
    if (textNode.nodeType !== Node.TEXT_NODE) {
      return null
    }
    
    const textContent = textNode.textContent || text
    const offset = range.startOffset
    
    // Find word boundaries
    let start = offset
    let end = offset
    
    // Move start backwards to word boundary
    while (start > 0 && /\S/.test(textContent[start - 1])) {
      start--
    }
    
    // Move end forwards to word boundary
    while (end < textContent.length && /\S/.test(textContent[end])) {
      end++
    }
    
    const word = textContent.slice(start, end).trim()
    return word ? word.replace(/[.,;:!?"""¿¡]/g, "") : null
  }, [])

  const handleBarExpand = () => {
    setIsWordBarExpanded(!isWordBarExpanded)
  }

  const closeWordBar = () => {
    setIsWordBarVisible(false)
    setIsWordBarExpanded(false)
    setActiveWord(null)
    setWordTranslationResult(null)
    setWordTranslationError(null)
    setWordDefinition(null)
    setWordDefinitionError(null)
  }

  const handleFontSizeSelect = useCallback((size: number) => {
    setReaderFontSize(clampFontSize(size))
  }, [])

  const renderClickableText = useCallback((paragraph: Paragraph) => {
    if (paragraph.isPlaceholder) {
      return (
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground/80">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading chunk…
        </span>
      )
    }

    const handleTextClick = (event: React.MouseEvent<HTMLElement>) => {
      event.stopPropagation()
      const word = extractWordFromClick(event, paragraph.spanish)
      if (word) {
        handleWordClick(word)
      }
    }

    const lookupHint = online ? undefined : "Offline — word lookups resume when you reconnect."
    return (
      <span
        onClick={handleTextClick}
        className="cursor-pointer select-text"
        title={lookupHint}
        style={{ userSelect: "text", fontSize: `${readerFontSize}px` }}
      >
        {paragraph.spanish}
      </span>
    )
  }, [handleWordClick, extractWordFromClick, online, readerFontSize])

  const renderWordTranslationBar = () => {
    if (!isWordBarVisible && !wordTranslationResult && !wordTranslationError) {
      return null
    }

    const currentWord = wordTranslationResult?.word ?? activeWord

    return (
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-40 transform-gpu transition-transform duration-300 ease-out",
          isWordBarVisible ? "translate-y-0" : "translate-y-full",
        )}
        aria-live="polite"
      >
        <div className="pointer-events-auto w-full border-t border-border/60 bg-background/95 shadow-lg backdrop-blur">
          <div className="relative px-4 py-2 sm:px-6">
            <div className="mx-auto flex max-w-2xl flex-col items-center space-y-1 px-4 text-center sm:px-8">
              <button
                type="button"
                onClick={handleBarExpand}
                className="w-full py-2 hover:bg-muted/30 transition-colors rounded-md cursor-pointer"
                aria-label={isWordBarExpanded ? "Collapse definition" : "Expand definition"}
              >
                <div className="h-0.5 w-12 mx-auto bg-muted-foreground/40 rounded-full" />
              </button>
              <div className="text-center">
                <p className="font-serif text-lg font-light text-muted-foreground">
                  {currentWord ?? "Tap a word"}
                </p>
                {isWordTranslationLoading ? (
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/90" />
                    <span className="text-lg font-light text-muted-foreground/90">Translating…</span>
                  </div>
                ) : wordTranslationResult?.translation ? (
                  <p className="font-serif text-lg font-light text-muted-foreground/90 mt-1">
                    {wordTranslationResult.translation}
                  </p>
                ) : null}
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-300 ease-out",
                    isWordBarExpanded ? "max-h-96 opacity-100 mt-2" : "max-h-0 opacity-0",
                  )}
                >
                {isWordDefinitionLoading ? (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/90" />
                      <span className="text-sm font-light text-muted-foreground/90">Loading definition…</span>
                    </div>
                  ) : wordDefinitionError ? (
                    <p className="text-xs font-medium text-destructive py-2">{wordDefinitionError}</p>
                  ) : wordDefinition ? (
                    <div className="py-2 text-center">
                      <p className="font-serif text-base font-light text-muted-foreground/70 leading-relaxed">
                        {wordDefinition}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
              {wordTranslationError && (
                <p className="text-center text-xs font-medium text-destructive">{wordTranslationError}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full hover:bg-destructive/10 hover:text-destructive sm:right-6"
              onClick={closeWordBar}
              aria-label="Close translation bar"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header
        ref={headerRef}
        className={cn(
          "fixed top-0 left-0 right-0 z-20 flex items-center justify-between border-b bg-card/60 px-4 py-2 backdrop-blur-sm transition-transform duration-200 ease-out shadow-sm",
          isHeaderHidden ? "-translate-y-full" : "translate-y-0",
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="hover:bg-accent"
          onClick={() => onBack?.()}
          aria-label="Go back"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 px-2 text-center">
          <h1 className="text-lg font-semibold leading-tight tracking-tight">{title ?? "Capítulo Seis"}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle ?? "1 Devorador de Almas"}</p>
        </div>
        <div ref={fontMenuRef} className="relative flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="hover:bg-accent"
            aria-label="Reading options"
            aria-haspopup="menu"
            aria-expanded={isFontMenuOpen}
            onClick={() => setIsFontMenuOpen((prev) => !prev)}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
          {isFontMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-border/60 bg-card/95 p-3 text-left shadow-xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Font size</p>
              <div className="mt-2 grid grid-cols-5 gap-1">
                {FONT_SIZE_OPTIONS.map((size) => (
                  <button
                    type="button"
                    key={size}
                    className={cn(
                      "rounded-md border px-2 py-1 text-sm font-medium transition-colors",
                      size === readerFontSize
                        ? "border-primary bg-primary/90 text-primary-foreground"
                        : "border-border/80 bg-background/40 hover:border-border hover:bg-accent/60",
                    )}
                    onClick={() => handleFontSizeSelect(size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      <div
        ref={scrollParentRef}
        className="flex-1 overflow-auto"
        style={{ paddingTop: headerHeight }}
      >
        {paragraphs.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6">
            {isInitialLoading ? (
              <div className="inline-flex items-center gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Loading paragraphs…</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No readable paragraphs yet.</p>
            )}
          </div>
        ) : (
          <div
            className="relative mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 pb-48"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {virtualItems.map((virtualItem) => {
              const paragraph = paragraphs[virtualItem.index]
              if (!paragraph) {
                return null
              }
              const isPlaceholder = paragraph.isPlaceholder === true
              const hasTranslation = !isPlaceholder && paragraph.spanish.trim().length > 0
              const isTranslationVisible = visibleTranslations.has(paragraph.id)
              const hasCachedTranslation = Boolean(translations[paragraph.id])
              const disableTranslationToggle = !online && !hasCachedTranslation
              const translationButtonTitle = disableTranslationToggle
                ? "Reconnect to translate this paragraph."
                : "Show translation"

              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  data-paragraph-id={paragraph.id}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className="pb-6"
                >
                  <div className="flex flex-col">
                    <div
                      className={cn(
                        "group relative flex items-baseline gap-1 px-1 sm:px-0",
                        hasTranslation && "sm:items-start sm:gap-0",
                      )}
                    >
                      {hasTranslation && (
                        <div
                          className="h-8 w-8 shrink-0 select-none opacity-0 sm:hidden"
                          aria-hidden="true"
                        />
                      )}
                      <p
                        className="flex-1 font-serif leading-relaxed text-foreground/80 text-left tracking-[0.01em] [text-wrap:pretty]"
                        style={{ fontSize: `${readerFontSize}px` }}
                      >
                        {renderClickableText(paragraph)}
                      </p>
                      {hasTranslation && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-8 w-8 shrink-0 -translate-y-0.5 opacity-35 transition-all duration-200 hover:opacity-75",
                            "sm:absolute sm:-right-12 sm:top-0 sm:h-9 sm:w-9 sm:translate-y-0 sm:opacity-65 sm:hover:opacity-80",
                          )}
                          onClick={() => handleParagraphClick(paragraph)}
                          aria-label={isTranslationVisible ? "Hide translation" : "Show translation"}
                          title={translationButtonTitle}
                          disabled={disableTranslationToggle}
                        >
                          {isTranslationVisible ? (
                            <X className="h-4 w-4" />
                          ) : (
                            <Link2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-300 ease-out",
                        isTranslationVisible && hasTranslation
                          ? "max-h-[1000px] opacity-100"
                          : "max-h-0 opacity-0"
                      )}
                    >
                      <div
                        className={cn(
                          "pt-3",
                          hasTranslation && "flex items-baseline gap-1 px-1 sm:px-0 sm:items-start sm:gap-0",
                        )}
                      >
                        {hasTranslation && (
                          <div
                            className="h-8 w-8 shrink-0 select-none opacity-0 sm:hidden"
                            aria-hidden="true"
                          />
                        )}
                        {(() => {
                          if (!isTranslationVisible || !hasTranslation) {
                            return null
                          }
                          const translatedText = translations[paragraph.id]
                          const translationError = translationErrors[paragraph.id]
                          const isLoading = loadingTranslations.has(paragraph.id)
                          
                          if (isLoading) {
                            return (
                              <span className="inline-flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Translating…
                              </span>
                            )
                          }
                          if (translationError) {
                            return <span className="text-sm font-medium text-destructive">{translationError}</span>
                          }
                          if (translatedText) {
                            return (
                              <p
                                className="flex-1 font-serif leading-relaxed text-muted-foreground/70 text-left tracking-[0.01em] [text-wrap:pretty]"
                                style={{ fontSize: `${readerFontSize}px` }}
                              >
                                {translatedText}
                              </p>
                            )
                          }
                          return (
                            <p
                              className="flex-1 font-serif leading-relaxed text-muted-foreground/90 text-left tracking-[0.01em] [text-wrap:pretty]"
                              style={{ fontSize: `${readerFontSize}px` }}
                            >
                              {paragraph.english}
                            </p>
                          )
                        })()}
                        {hasTranslation && (
                          <div
                            className="h-8 w-8 shrink-0 select-none opacity-0 sm:hidden"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>


      {renderWordTranslationBar()}
    </div>
  )
}
