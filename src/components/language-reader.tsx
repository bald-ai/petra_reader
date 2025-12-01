"use client"

import { useState, useCallback, useEffect, useLayoutEffect, useRef } from "react"
import { useAction } from "convex/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ChevronDown, ChevronLeft, Link2, Loader2, MoreVertical, X, Volume2, Square } from "lucide-react"
import { api } from "@convex/_generated/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useOnline } from "@/hooks/use-online"

export interface Paragraph {
  id: number
  spanish: string
  english: string
  isPlaceholder?: boolean
  isHeading?: boolean
}

export type ChapterInfo = {
  index: number
  title: string
  startParagraphId: number
}

type ConjugationTense = "present" | "preterite" | "imperfect" | "conditional" | "future"
type ConjugationsByTense = Record<
  ConjugationTense,
  Array<{
    pronoun: string
    form: string
  }>
>

const MAX_VISIBLE_TRANSLATIONS = 5
const LOAD_MORE_THRESHOLD = 4
const MAX_WORD_TRANSLATION_CACHE_SIZE = 100
const MAX_CONJUGATION_CACHE_SIZE = 50
const DEFAULT_FONT_SIZE = 16
const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 24
const CONJUGATION_TENSES: ConjugationTense[] = [
  "present",
  "preterite",
  "imperfect",
  "conditional",
  "future",
]

const clampFontSize = (size: number) => Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size))
const FONT_SIZE_OPTIONS = [-2, -1, 0, 1, 2].map((offset) => clampFontSize(DEFAULT_FONT_SIZE + offset))
const buildEmptyConjugations = (): ConjugationsByTense =>
  CONJUGATION_TENSES.reduce((acc, tense) => {
    acc[tense] = []
    return acc
  }, {} as ConjugationsByTense)

type WordTranslationResult = {
  word: string
  translation: string
}

type WordSelection = {
  word: string
  sentence?: string
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
  scrollToParagraphId?: number | null
  chapters?: ChapterInfo[]
  activeChapterIndex?: number
  onSelectChapter?: (chapter: ChapterInfo) => void
}

export default function LanguageReader({
  title,
  subtitle,
  paragraphs = [],
  hasMore = false,
  isInitialLoading = false,
  isLoadingMore = false,
  onLoadMore,
  onBack,
  onVisibleRangeChange,
  scrollToParagraphId,
  chapters = [],
  activeChapterIndex = 0,
  onSelectChapter,
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
  const [wordContextSentence, setWordContextSentence] = useState<string | null>(null)
  const [wordDefinition, setWordDefinition] = useState<string | null>(null)
  const [isWordDefinitionLoading, setIsWordDefinitionLoading] = useState(false)
  const [wordDefinitionError, setWordDefinitionError] = useState<string | null>(null)
  const [readerFontSize, setReaderFontSize] = useState(DEFAULT_FONT_SIZE)
  const [isFontMenuOpen, setIsFontMenuOpen] = useState(false)
  const [isChapterMenuOpen, setIsChapterMenuOpen] = useState(false)
  const [isHeaderHidden, setIsHeaderHidden] = useState(false)
  const [headerHeight, setHeaderHeight] = useState(56)
  const [activeTab, setActiveTab] = useState("translation")
  const [activeConjugationTense, setActiveConjugationTense] =
    useState<ConjugationTense>("present")
  const [conjugations, setConjugations] = useState<ConjugationsByTense | null>(null)
  const [nonConjugatableWords, setNonConjugatableWords] = useState<Set<string>>(new Set())
  const [isConjugationLoading, setIsConjugationLoading] = useState(false)
  const [conjugationError, setConjugationError] = useState<string | null>(null)
  const [isTTSLoading, setIsTTSLoading] = useState(false)
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [paragraphTTSLoading, setParagraphTTSLoading] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wordTranslationsCacheRef = useRef<Map<string, WordTranslationResult>>(new Map())
  const conjugationCacheRef = useRef<Map<string, ConjugationsByTense>>(new Map())
  const wordTranslationRequestIdRef = useRef(0)
  const wordDefinitionRequestIdRef = useRef(0)
  const conjugationRequestIdRef = useRef(0)
  const paragraphTranslationRequestIdsRef = useRef(new Map<number, number>())
  const isMountedRef = useRef(true)
  const visibleRangeRef = useRef<{ startIndex: number; endIndex: number } | null>(null)
  const translateParagraphAction = useAction(api.translations.translateParagraph)
  const translateWordAction = useAction(api.translations.translateWord)
  const lookupWordDefinitionAction = useAction(api.translations.lookupWordDefinition)
  const lookupVerbConjugationsAction = useAction(api.translations.lookupVerbConjugations)
  const headerRef = useRef<HTMLElement | null>(null)
  const chapterMenuRef = useRef<HTMLDivElement | null>(null)
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
    if (!isChapterMenuOpen) {
      return
    }
    const handleClick = (event: MouseEvent) => {
      if (!chapterMenuRef.current) {
        return
      }
      if (!chapterMenuRef.current.contains(event.target as Node)) {
        setIsChapterMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsChapterMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isChapterMenuOpen])

  useEffect(() => {
    if (isHeaderHidden) {
      setIsFontMenuOpen(false)
      setIsChapterMenuOpen(false)
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

  const pendingScrollParagraphIdRef = useRef<number | null>(scrollToParagraphId ?? null)

  useEffect(() => {
    if (typeof scrollToParagraphId === "number") {
      pendingScrollParagraphIdRef.current = scrollToParagraphId
    } else {
      pendingScrollParagraphIdRef.current = null
    }
  }, [scrollToParagraphId])

  useEffect(() => {
    const targetParagraphId = pendingScrollParagraphIdRef.current
    if (!targetParagraphId || paragraphs.length === 0 || isInitialLoading) {
      return
    }

    const targetIndex = paragraphs.findIndex((p) => p.id === targetParagraphId && !p.isPlaceholder)
    if (targetIndex >= 0) {
      pendingScrollParagraphIdRef.current = null
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            try {
              rowVirtualizer.scrollToIndex(targetIndex, {
                align: "start",
                behavior: "auto",
              })
            } catch (error) {
              console.warn("Failed to scroll to target paragraph:", error)
            }
          }, 100)
        })
      })
    }
  }, [paragraphs, isInitialLoading, rowVirtualizer])

  const fetchWordConjugations = useCallback(
    async (word: string) => {
      if (!word) {
        return
      }

      const normalizedWord = word.toLowerCase()
      if (nonConjugatableWords.has(normalizedWord)) {
        setIsConjugationLoading(false)
        setConjugations(null)
        setConjugationError("This word is not a verb, so conjugations are unavailable.")
        return
      }

      conjugationRequestIdRef.current += 1
      const requestId = conjugationRequestIdRef.current
      const cacheKey = normalizedWord
      const cache = conjugationCacheRef.current
      const cached = cache.get(cacheKey)
      setConjugationError(null)

      if (cached) {
        cache.delete(cacheKey)
        cache.set(cacheKey, cached)
        if (isMountedRef.current && conjugationRequestIdRef.current === requestId) {
          setIsConjugationLoading(false)
          setConjugations(cached)
        }
        return
      }

      if (!online) {
        if (isMountedRef.current && conjugationRequestIdRef.current === requestId) {
          setIsConjugationLoading(false)
          setConjugationError("Offline — conjugations resume when you reconnect.")
          setConjugations(null)
        }
        return
      }

      setIsConjugationLoading(true)
      setConjugations(null)

      try {
        const result = await lookupVerbConjugationsAction({ word })
        if (!isMountedRef.current || conjugationRequestIdRef.current !== requestId) {
          return
        }

        if (result?.error) {
          setNonConjugatableWords((prev) => {
            const next = new Set(prev)
            next.add(normalizedWord)
            return next
          })
          setConjugationError(
            typeof result.error === "string"
              ? result.error
              : "Conjugations are unavailable for this word.",
          )
          setConjugations(null)
          return
        }

        const normalized: ConjugationsByTense = buildEmptyConjugations()
        const incoming = result?.conjugations
        for (const tense of CONJUGATION_TENSES) {
          const entries = incoming?.[tense]
          if (Array.isArray(entries)) {
            normalized[tense] = entries
              .map((entry) => ({
                pronoun: typeof entry?.pronoun === "string" ? entry.pronoun : "",
                form: typeof entry?.form === "string" ? entry.form : "",
              }))
              .filter(
                (entry) =>
                  typeof entry.pronoun === "string" &&
                  entry.pronoun.trim() &&
                  typeof entry.form === "string" &&
                  entry.form.trim(),
              )
              .map((entry) => ({
                pronoun: entry.pronoun.trim(),
                form: entry.form.trim(),
              }))
          }
        }

        cache.set(cacheKey, normalized)
        if (cache.size > MAX_CONJUGATION_CACHE_SIZE) {
          const oldestKey = cache.keys().next().value
          if (oldestKey) {
            cache.delete(oldestKey)
          }
        }
        setConjugations(normalized)
      } catch (error) {
        if (!isMountedRef.current || conjugationRequestIdRef.current !== requestId) {
          return
        }
        const message =
          error instanceof Error ? error.message : "Unable to fetch conjugations right now."
        setConjugationError(message)
        setConjugations(null)
      } finally {
        if (isMountedRef.current && conjugationRequestIdRef.current === requestId) {
          setIsConjugationLoading(false)
        }
      }
    },
    [lookupVerbConjugationsAction, online, nonConjugatableWords],
  )

  const fetchWordDefinition = useCallback(async (word: string, sentence?: string) => {
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
      const definitionResult = await lookupWordDefinitionAction({ word, sentence })

      if (!isMountedRef.current || wordDefinitionRequestIdRef.current !== requestId) {
        return
      }

      setWordDefinition(definitionResult.definition)
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

  const fetchWordTranslation = useCallback(async (word: string, sentence?: string) => {
    if (!word) {
      return
    }

    const contextSentence = sentence?.trim() || wordContextSentence || undefined
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
          void fetchWordDefinition(word, contextSentence)
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

      void fetchWordDefinition(word, contextSentence)
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
  }, [wordDefinition, translateWordAction, fetchWordDefinition, online, wordContextSentence])

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

  const handleWordClick = useCallback((word: string, sentence?: string) => {
    const cleanWord = word.replace(/[.,;:!?"""¿¡]/g, "")
    const normalizedSentence = sentence?.trim() || undefined
    if (!cleanWord) {
      return
    }

    setActiveWord(cleanWord)
    setWordContextSentence(normalizedSentence ?? null)
    setIsWordBarVisible(true)
    setIsWordBarExpanded(false)
    setActiveTab("translation")
    setActiveConjugationTense("present")
    setWordDefinition(null)
    setWordDefinitionError(null)
    setConjugations(null)
    setConjugationError(null)
    setIsConjugationLoading(false)
    wordDefinitionRequestIdRef.current += 1
    conjugationRequestIdRef.current += 1
    void fetchWordTranslation(cleanWord, normalizedSentence)
  }, [fetchWordTranslation])

  const extractWordFromClick = useCallback(
    (event: React.MouseEvent<HTMLElement>, text: string): WordSelection | null => {
      const getWordSelection = (textContent: string, offset: number): WordSelection | null => {
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

        const rawWord = textContent.slice(start, end).trim()
        const word = rawWord ? rawWord.replace(/[.,;:!?"""¿¡]/g, "") : ""
        if (!word) {
          return null
        }

        // Extract the sentence containing the word (delimited by common punctuation).
        const delimiter = /[.!?¡¿]/
        let sentenceStart = start
        while (sentenceStart > 0 && !delimiter.test(textContent[sentenceStart - 1])) {
          sentenceStart--
        }
        while (sentenceStart < textContent.length && /\s/.test(textContent[sentenceStart])) {
          sentenceStart++
        }

        let sentenceEnd = end
        while (sentenceEnd < textContent.length) {
          if (delimiter.test(textContent[sentenceEnd])) {
            sentenceEnd++
            break
          }
          sentenceEnd++
        }
        while (sentenceEnd > sentenceStart && /\s/.test(textContent[sentenceEnd - 1])) {
          sentenceEnd--
        }

        const sentence = textContent.slice(sentenceStart, sentenceEnd).trim()

        return { word, sentence: sentence || undefined }
      }

      // Get the text node and character offset at click position
      const range = document.caretRangeFromPoint?.(event.clientX, event.clientY)
      if (!range) {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const selRange = selection.getRangeAt(0)
          if (selRange.startContainer.nodeType === Node.TEXT_NODE) {
            const textNode = selRange.startContainer as Text
            const offset = selRange.startOffset
            const textContent = textNode.textContent || text
            return getWordSelection(textContent, offset)
          }
        }
        return null
      }

      const textNode = range.startContainer
      if (textNode.nodeType !== Node.TEXT_NODE) {
        return null
      }

      const textContent = textNode.textContent || text
      const offset = range.startOffset
      return getWordSelection(textContent, offset)
    },
    [],
  )

  const closeWordBar = () => {
    setIsWordBarVisible(false)
    setIsWordBarExpanded(false)
    setActiveWord(null)
    setWordTranslationResult(null)
    setWordTranslationError(null)
    setWordDefinition(null)
    setWordContextSentence(null)
    setWordDefinitionError(null)
    setConjugations(null)
    setConjugationError(null)
    setIsConjugationLoading(false)
    setActiveConjugationTense("present")
    wordTranslationRequestIdRef.current += 1
    wordDefinitionRequestIdRef.current += 1
    conjugationRequestIdRef.current += 1
    setActiveTab("translation")
  }

  const handleFontSizeSelect = useCallback((size: number) => {
    setReaderFontSize(clampFontSize(size))
  }, [])

  const [definitionTTSPlaying, setDefinitionTTSPlaying] = useState(false)

  const stopDefinitionTTS = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsTTSLoading(false);
    setDefinitionTTSPlaying(false);
  }, [])

  const handleTTS = useCallback(async (text: string, isDefinition = false) => {
    // If definition is playing, stop it
    if (isDefinition && definitionTTSPlaying) {
      stopDefinitionTTS();
      return;
    }

    if (!text || isTTSLoading) return;

    setIsTTSLoading(true);
    setTtsError(null);

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setDefinitionTTSPlaying(false);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audioRef.current = audio;
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        setIsTTSLoading(false);
        setDefinitionTTSPlaying(false);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        setIsTTSLoading(false);
        setDefinitionTTSPlaying(false);
        setTtsError('Failed to play audio');
      };

      await audio.play();
      setIsTTSLoading(false);
      if (isDefinition) {
        setDefinitionTTSPlaying(true);
      }
    } catch (error) {
      console.error('TTS error:', error);
      setTtsError('Failed to generate audio');
      setIsTTSLoading(false);
    }
  }, [isTTSLoading, definitionTTSPlaying, stopDefinitionTTS])

  const [paragraphTTSPlaying, setParagraphTTSPlaying] = useState<number | null>(null)

  const stopParagraphTTS = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setParagraphTTSLoading(null);
    setParagraphTTSPlaying(null);
  }, [])

  const handleParagraphTTS = useCallback(async (paragraph: Paragraph) => {
    // If this paragraph is currently playing, stop it
    if (paragraphTTSPlaying === paragraph.id) {
      stopParagraphTTS();
      return;
    }

    if (!paragraph.spanish || paragraphTTSLoading === paragraph.id) return;

    // Stop any currently playing audio
    stopParagraphTTS();

    setParagraphTTSLoading(paragraph.id);
    setTtsError(null);

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: paragraph.spanish }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audioRef.current = audio;
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        setParagraphTTSLoading(null);
        setParagraphTTSPlaying(null);
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        setParagraphTTSLoading(null);
        setParagraphTTSPlaying(null);
        setTtsError('Failed to play audio');
      };

      await audio.play();
      setParagraphTTSLoading(null);
      setParagraphTTSPlaying(paragraph.id);
    } catch (error) {
      console.error('TTS error:', error);
      setTtsError('Failed to generate audio');
      setParagraphTTSLoading(null);
    }
  }, [paragraphTTSLoading, paragraphTTSPlaying, stopParagraphTTS])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
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
      const selection = extractWordFromClick(event, paragraph.spanish)
      if (selection) {
        handleWordClick(selection.word, selection.sentence)
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
    const activeConjugations = conjugations?.[activeConjugationTense] ?? []

    return (
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 bottom-0 z-40 transform-gpu transition-transform duration-300 ease-out",
          isWordBarVisible ? "translate-y-0" : "translate-y-full",
        )}
        aria-live="polite"
      >
        <div 
          className="pointer-events-auto w-full border-t border-border/60 bg-background/95 shadow-lg backdrop-blur"
          style={{ 
            maxHeight: isWordBarExpanded ? '600px' : 'auto',
            transition: 'max-height 0.2s ease-out',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {!isWordBarExpanded ? (
            <div className="relative px-4 py-2 sm:px-6">
              <div className="mx-auto flex max-w-2xl flex-col items-center space-y-1 px-4 text-center sm:px-8">
                <button
                  type="button"
                  onClick={() => setIsWordBarExpanded(true)}
                  className="w-full py-2 hover:bg-muted/30 transition-colors rounded-md cursor-pointer mb-1"
                  aria-label="Expand options"
                >
                  <div className="h-1 w-12 mx-auto bg-muted-foreground/20 rounded-full" />
                </button>
                <div className="text-center w-full pb-2">
                  <p className="font-serif text-lg font-light text-muted-foreground">
                    {currentWord ?? "Tap a word"}
                  </p>
                  {isWordTranslationLoading ? (
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/90" />
                      <span className="text-lg font-light text-muted-foreground/90">Translating…</span>
                    </div>
                  ) : wordTranslationResult?.translation ? (
                    <>
                      <p className="font-serif text-xl font-medium text-foreground mt-1">
                        {wordTranslationResult.translation}
                      </p>
                      {wordTranslationResult.word && (
                        <div className="mt-3 flex justify-center">
                          <Button
                            onClick={() => handleTTS(wordTranslationResult.word)}
                            disabled={isTTSLoading}
                            variant="outline"
                            size="sm"
                            className="gap-2"
                          >
                            {isTTSLoading ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span className="text-xs">Generating...</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3 w-3" />
                                <span className="text-xs">Listen</span>
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-4 top-3 h-7 w-7 rounded-full hover:bg-destructive/10 hover:text-destructive sm:right-6 sm:top-3"
                onClick={closeWordBar}
                aria-label="Close translation bar"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-col h-[500px]">
               <div className="relative pr-14 px-4 py-4 border-b bg-card/30">
                 <div className="flex justify-center gap-2 mb-4">
                   {["translation", "definition", "conjugation"].map((tab) => {
                     const isActive = activeTab === tab
                     return (
                       <Button
                         key={tab}
                         variant={isActive ? "secondary" : "ghost"}
                         size="sm"
                         onClick={() => {
                           setActiveTab(tab)
                           if (tab === "conjugation") {
                             const targetWord = wordTranslationResult?.word ?? activeWord
                             if (targetWord) {
                               void fetchWordConjugations(targetWord)
                             } else {
                               setConjugationError("Select a word to see conjugations.")
                             }
                           }
                         }}
                         className={cn(
                           "capitalize min-w-[90px] transition-all",
                           isActive
                             ? "font-medium shadow-sm"
                             : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                         )}
                       >
                         {tab}
                       </Button>
                     )
                   })}
                 </div>
                 
                 {activeTab === "conjugation" && (
                    <div className="flex flex-wrap justify-center gap-2 pb-1 px-2 pt-2 border-t border-border/40">
                      {CONJUGATION_TENSES.map((tense) => (
                        <Button
                          key={tense}
                          variant={activeConjugationTense === tense ? "secondary" : "ghost"}
                          size="sm"
                          onClick={() => setActiveConjugationTense(tense)}
                          className={cn(
                            "capitalize text-xs h-7 min-w-[80px] transition-all",
                            activeConjugationTense === tense 
                              ? "bg-secondary/80 text-secondary-foreground font-medium shadow-sm" 
                              : "text-muted-foreground/80 hover:bg-accent hover:text-accent-foreground"
                          )}
                        >
                          {tense}
                        </Button>
                      ))}
                    </div>
                 )}

                 <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-4 top-4 h-7 w-7 rounded-full hover:bg-destructive/10 hover:text-destructive"
                    onClick={closeWordBar}
                    aria-label="Close translation bar"
                  >
                    <X className="h-3 w-3" />
                  </Button>
               </div>

               <div className="flex-1 overflow-y-auto p-4 bg-muted/5">
                 <div className="mx-auto max-w-2xl text-center">
                   {activeTab === "translation" && (
                     <div className="space-y-4 py-8">
                       <div>
                         <h3 className="text-sm font-medium text-muted-foreground mb-1">Word</h3>
                         <p className="text-2xl font-serif">{currentWord}</p>
                       </div>
                       <div>
                         <h3 className="text-sm font-medium text-muted-foreground mb-1">Translation</h3>
                         {isWordTranslationLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                         ) : (
                         <>
                           <p className="text-2xl font-serif font-medium">{wordTranslationResult?.translation}</p>
                           {wordTranslationResult?.word && (
                             <div className="mt-6 flex justify-center">
                               <Button
                                 onClick={() => handleTTS(wordTranslationResult.word)}
                                 disabled={isTTSLoading}
                                 variant="outline"
                                 size="lg"
                                 className="gap-2"
                               >
                                 {isTTSLoading ? (
                                   <>
                                     <Loader2 className="h-4 w-4 animate-spin" />
                                     <span>Generating audio...</span>
                                   </>
                                 ) : (
                                   <>
                                     <Volume2 className="h-4 w-4" />
                                     <span>Listen</span>
                                   </>
                                 )}
                               </Button>
                             </div>
                           )}
                           {ttsError && (
                             <p className="text-sm text-destructive mt-2">{ttsError}</p>
                           )}
                          </>
                        )}
                       </div>
                     </div>
                   )}

                   {activeTab === "definition" && (
                     <div className="py-4">
                       {isWordDefinitionLoading ? (
                         <div className="flex flex-col items-center justify-center gap-2 py-8">
                           <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/90" />
                           <span className="text-sm font-light text-muted-foreground/90">Loading definition…</span>
                         </div>
                       ) : wordDefinitionError ? (
                         <p className="text-sm font-medium text-destructive py-2">{wordDefinitionError}</p>
                      ) : wordDefinition ? (
                        <div className="text-center space-y-4">
                          <p className="font-serif text-lg font-light text-muted-foreground/80 leading-relaxed max-w-lg mx-auto">
                            {wordDefinition}
                          </p>
                          <div className="mt-6 flex justify-center">
                            <Button
                              onClick={() => handleTTS(wordDefinition, true)}
                              disabled={isTTSLoading && !definitionTTSPlaying}
                              variant="outline"
                              size="lg"
                              className="gap-2"
                            >
                              {isTTSLoading && !definitionTTSPlaying ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  <span>Generating audio...</span>
                                </>
                              ) : definitionTTSPlaying ? (
                                <>
                                  <Square className="h-3.5 w-3.5 fill-current" />
                                  <span>Stop</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="h-4 w-4" />
                                  <span>Listen</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                         <p className="text-sm text-muted-foreground">No definition available.</p>
                       )}
                     </div>
                   )}

                   {activeTab === "conjugation" && (
                     <div className="relative py-2 text-left max-w-md mx-auto">
                       {isConjugationLoading && (
                         <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-background/80 backdrop-blur-sm">
                           <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/90" />
                           <span className="text-xs font-medium text-muted-foreground/80">Fetching conjugations…</span>
                         </div>
                       )}
                       <h4 className="font-medium capitalize text-muted-foreground mb-4 text-center text-lg">{activeConjugationTense}</h4>
                      {conjugationError ? (
                        <p className="text-sm font-medium text-destructive text-center">{conjugationError}</p>
                      ) : activeConjugations.length > 0 ? (
                        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-3 text-base items-center">
                          {activeConjugations.map((item, i) => (
                            <div key={`${item.pronoun}-${i}`} className="contents">
                              <span className="text-muted-foreground/60 text-right">{item.pronoun}</span>
                              <span className="font-medium text-foreground/80">{item.form}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-60 hover:opacity-100 transition-opacity"
                                onClick={() => handleTTS(item.form)}
                                disabled={isTTSLoading}
                                aria-label={`Listen to ${item.form}`}
                                title={`Listen to ${item.form}`}
                              >
                                <Volume2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : !isConjugationLoading ? (
                        <p className="text-sm text-muted-foreground text-center">No conjugations available yet.</p>
                      ) : null}
                     </div>
                   )}
                 </div>
               </div>
            </div>
          )}
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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            className="hover:bg-accent"
            onClick={() => onBack?.()}
            aria-label="Go back"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {chapters.length > 0 && (
            <div ref={chapterMenuRef} className="relative">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 truncate max-w-[220px] border-border/60 bg-background/70 text-left hover:bg-accent"
                aria-haspopup="menu"
                aria-expanded={isChapterMenuOpen}
                onClick={() => setIsChapterMenuOpen((prev) => !prev)}
              >
                <span className="hidden sm:inline truncate">
                  {chapters[activeChapterIndex]?.title ?? "Chapters"}
                </span>
                <span className="sm:hidden">Chapters</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Button>
              {isChapterMenuOpen && (
                <div className="absolute left-0 top-full z-30 mt-2 w-64 max-w-sm rounded-lg border border-border/60 bg-card/95 p-2 shadow-xl backdrop-blur">
                  <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Chapters
                  </p>
                  <div className="max-h-72 overflow-auto">
                    {chapters.map((chapter) => {
                      const isActive = chapter.index === (chapters[activeChapterIndex]?.index ?? 0)
                      return (
                        <button
                          key={chapter.index}
                          type="button"
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
                            isActive
                              ? "bg-accent text-accent-foreground"
                              : "hover:bg-muted/60 text-foreground"
                          )}
                          onClick={() => {
                            setIsChapterMenuOpen(false)
                            onSelectChapter?.(chapter)
                          }}
                        >
                          <span className="truncate">{chapter.title}</span>
                          {isActive && <span className="text-[10px] font-semibold uppercase text-muted-foreground">Now</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
              const isHeading = paragraph.isHeading === true
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
                    {isHeading ? (
                      <div className="px-1 sm:px-0 py-4">
                        <p
                          className="text-center font-serif text-xl font-semibold text-foreground/90 tracking-tight"
                          style={{ fontSize: `${Math.min(readerFontSize + 4, 28)}px` }}
                        >
                          {paragraph.spanish}
                        </p>
                      </div>
                    ) : (
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
                    )}
                    {!isHeading && (
                      <div
                        className={cn(
                          "transition-all duration-300 ease-out",
                          isTranslationVisible && hasTranslation
                            ? "max-h-[1000px] opacity-100"
                            : "max-h-0 opacity-0 overflow-hidden"
                        )}
                      >
                        <div
                                          className={cn(
                                            "group relative pt-3",
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
                                          {hasTranslation && isTranslationVisible && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className={cn(
                                                "h-8 w-8 shrink-0 -translate-y-0.5 opacity-70 transition-all duration-200 hover:opacity-100",
                                                "sm:absolute sm:-right-12 sm:top-0 sm:h-9 sm:w-9 sm:translate-y-0 sm:opacity-80 sm:hover:opacity-100",
                                              )}
                                              onClick={() => handleParagraphTTS(paragraph)}
                                              disabled={paragraphTTSLoading === paragraph.id}
                                              aria-label={paragraphTTSPlaying === paragraph.id ? "Stop audio" : "Play paragraph audio"}
                                              title={paragraphTTSPlaying === paragraph.id ? "Stop" : "Listen to paragraph"}
                                            >
                                              {paragraphTTSLoading === paragraph.id ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                              ) : paragraphTTSPlaying === paragraph.id ? (
                                                <Square className="h-3.5 w-3.5 fill-current" />
                                              ) : (
                                                <Volume2 className="h-4 w-4" />
                                              )}
                                            </Button>
                                          )}
                                          {hasTranslation && !isTranslationVisible && (
                                            <div
                                              className="h-8 w-8 shrink-0 select-none opacity-0 sm:hidden"
                                              aria-hidden="true"
                                            />
                                          )}
                                        </div>
                      </div>
                    )}
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
