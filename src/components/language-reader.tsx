"use client"

import { useState } from "react"
import { ChevronLeft, HelpCircle, MoreVertical, Link2, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

export interface Paragraph {
  id: number
  text: string
  translation?: string | null
}

interface WordDefinition {
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

const defaultParagraphs: Paragraph[] = [
  {
    id: 1,
    text:
      "También estaba solo. Tragué, con un chasquido en la garganta, y traté de mantener la calma mientras repasaba los hechos. Uno: había habido un incidente en la base. Dos: la última vez que estuve consciente, estaba atrapado en una celda con Wyn el Soul Eater, sin poder salir.",
    translation:
      "I was also alone. I swallowed, with a click in my throat, and tried to stay calm while going over the facts. One: there had been an incident at the base. Two: the last time I was aware, I was trapped in a cell with Wyn the Soul Eater, unable to escape.",
  },
  {
    id: 2,
    text:
      "Tres: ahora estaba en una habitación de motel, así que definitivamente estaba fuera de la base. Cuatro: estaba vivo, así que Wyn no me había matado. Otra vez.",
    translation:
      "Three: I was now in a motel room, so I was definitely out of the base. Four: I was alive, so Wyn hadn't killed me. Again.",
  },
  {
    id: 3,
    text:
      "Eso significaba que alguien debía haberme sacado de la celda de Wyn después de resolver el incidente. Tal vez la base había sido comprometida y todos habíamos sido trasladados mientras se resolvía. Ese parecía el escenario más probable.",
    translation:
      "That meant someone must have gotten me out of Wyn's cell after resolving the incident. Maybe the base had been compromised and we had all been relocated while it was being resolved. That seemed like the most likely scenario.",
  },
]

const sampleDefinitions: Record<string, WordDefinition> = {
  También: {
    word: "También",
    type: "adverb",
    translation: "Also",
    definitions: {
      spanish: "Usado para indicar la igualdad, semejanza, conformidad o relación de una cosa con otra ya nombrada.",
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

type LanguageReaderProps = {
  title?: string
  subtitle?: string | null
  paragraphs?: Paragraph[]
  onBack?: () => void
}

export default function LanguageReader({
  title,
  subtitle,
  paragraphs = defaultParagraphs,
  onBack,
}: LanguageReaderProps) {
  const [visibleTranslations, setVisibleTranslations] = useState<Set<number>>(new Set())
  const [selectedWord, setSelectedWord] = useState<WordDefinition | null>(null)
  const [activeTab, setActiveTab] = useState("translation")

  const handleParagraphClick = (id: number) => {
    setVisibleTranslations((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleWordClick = (word: string) => {
    const cleanWord = word.replace(/[.,;:!?]/g, "")
    const definition = sampleDefinitions[cleanWord]
    if (definition) {
      if (selectedWord?.word === definition.word) {
        setSelectedWord(null)
      } else {
        setSelectedWord(definition)
        setActiveTab("translation")
      }
    }
  }

  const handleClosePanel = () => {
    setSelectedWord(null)
  }

  const renderClickableText = (text: string, paragraphId: number) => {
    const words = text.split(" ")
    return (
      <span>
        {words.map((word, index) => {
          const cleanWord = word.replace(/[.,;:!?]/g, "")
          const hasDefinition = sampleDefinitions[cleanWord]
          const punctuation = word.match(/[.,;:!?]/g)?.[0] || ""

          return (
            <span key={`${paragraphId}-${index}`}>
              {hasDefinition ? (
                <span
                  className="cursor-pointer hover:text-primary transition-all duration-200 underline decoration-primary/40 hover:decoration-primary decoration-2 underline-offset-4"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleWordClick(word)
                  }}
                >
                  {cleanWord}
                </span>
              ) : (
                <span>{cleanWord}</span>
              )}
              {punctuation}{" "}
            </span>
          )
        })}
      </span>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <Button variant="ghost" size="icon" className="hover:bg-accent" onClick={onBack}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{title ?? "Capítulo Seis"}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {subtitle ?? "1 Devorador de Almas"}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="hover:bg-accent">
            <HelpCircle className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="hover:bg-accent">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8 pb-96 space-y-6">
          {paragraphs.map((paragraph) => {
            const translationText = paragraph.translation?.trim()
            const hasTranslation = Boolean(translationText && translationText.length > 0)
            const showTranslation = hasTranslation && visibleTranslations.has(paragraph.id)
            return (
              <div key={paragraph.id}>
                {showTranslation ? (
                  <Card className="p-6 border-border/50 shadow-sm hover:shadow-md transition-shadow duration-200">
                    <div className="flex gap-4 items-start">
                      <div className="flex-1 space-y-3">
                        <p className="text-lg leading-relaxed text-foreground font-serif">
                          {renderClickableText(paragraph.text, paragraph.id)}
                        </p>
                        <Separator className="my-3" />
                        <p className="text-base leading-relaxed text-muted-foreground animate-in fade-in-50 duration-300">
                          {translationText}
                        </p>
                      </div>
                      <Button
                        variant="default"
                        size="icon"
                        className="h-9 w-9 shrink-0 mt-1 transition-all duration-200"
                        onClick={() => handleParagraphClick(paragraph.id)}
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ) : (
                  <div className="flex gap-4 items-start group">
                    <p className="flex-1 text-lg leading-relaxed text-foreground font-serif">
                      {renderClickableText(paragraph.text, paragraph.id)}
                    </p>
                    {hasTranslation && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-all duration-200"
                        onClick={() => handleParagraphClick(paragraph.id)}
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>

      {selectedWord && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t shadow-2xl animate-in slide-in-from-bottom duration-300">
          <Card className="rounded-none border-0 border-t">
            <div className="flex items-center justify-between px-6 py-5 border-b">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" className="h-11 w-11 rounded-full bg-transparent">
                  <Plus className="h-5 w-5" />
                </Button>
                <h2 className="text-3xl font-light tracking-tight">{selectedWord.word}</h2>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-full hover:bg-destructive/10 hover:text-destructive"
                onClick={handleClosePanel}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0 gap-8 px-6">
                <TabsTrigger
                  value="translation"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-4 font-medium"
                >
                  Translation
                </TabsTrigger>
                <TabsTrigger
                  value="definitions"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-0 py-4 font-medium"
                >
                  Definitions
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[50vh]">
                <TabsContent value="translation" className="p-6 space-y-6 mt-0">
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="secondary" className="rounded-full px-4 py-1.5 text-xs font-medium">
                      LdF 42
                    </Badge>
                    <Badge variant="secondary" className="rounded-full px-4 py-1.5 text-xs font-medium">
                      Počet 60
                    </Badge>
                    <Badge variant="secondary" className="rounded-full px-4 py-1.5 text-xs font-medium">
                      Naučené
                    </Badge>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-accent/50 border">
                      <h3 className="text-2xl font-light">{selectedWord.translations.main}</h3>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full shrink-0">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    {selectedWord.translations.alternatives.map((alt, index) => (
                      <Card key={index} className="p-4 border-border/50 hover:border-border transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-baseline gap-2">
                              <span className="font-semibold text-lg">{alt.word}</span>
                              <Badge variant="outline" className="text-xs">
                                {alt.type}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{alt.meanings.join(", ")}</p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full shrink-0">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="definitions" className="p-6 space-y-6 mt-0">
                  <Card className="p-5 border-border/50 bg-accent/30">
                    <div className="space-y-4">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-xl">{selectedWord.word}</span>
                        <Badge variant="outline" className="text-xs">
                          {selectedWord.type}
                        </Badge>
                      </div>
                      <p className="text-base leading-relaxed">{selectedWord.definitions.spanish}</p>

                      {selectedWord.definitions.related.length > 0 && (
                        <>
                          <Separator className="my-4" />
                          <div className="flex gap-2 flex-wrap">
                            {selectedWord.definitions.related.map((word, index) => (
                              <Badge key={index} variant="secondary" className="rounded-full px-3 py-1">
                                {word}
                              </Badge>
                            ))}
                          </div>
                        </>
                      )}

                      {selectedWord.definitions.examples.length > 0 && (
                        <>
                          <Separator className="my-4" />
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">Examples:</p>
                            {selectedWord.definitions.examples.map((example, index) => (
                              <p key={index} className="text-sm text-muted-foreground italic pl-4 border-l-2">
                                {example}
                              </p>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </Card>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </Card>
        </div>
      )}
    </div>
  )
}
