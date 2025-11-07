"use client"

import { useState } from "react"
import { useAction } from "convex/react"
import { ChevronLeft, HelpCircle, Link2, Loader2, MoreVertical, Plus, X } from "lucide-react"
import { api } from "@convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

export interface Paragraph {
  id: number
  spanish: string
  english: string
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
  const [translations, setTranslations] = useState<Record<number, string>>({})
  const [translationErrors, setTranslationErrors] = useState<Record<number, string>>({})
  const [loadingTranslations, setLoadingTranslations] = useState<Set<number>>(new Set())
  const [selectedWord, setSelectedWord] = useState<WordDefinition | null>(null)
  const [activeTab, setActiveTab] = useState("translation")
  const translateParagraphAction = useAction(api.translations.translateParagraph)

  const hasVisibleTranslation = visibleTranslations.size > 0

  const ensureTranslation = async (paragraph: Paragraph) => {
    if (translations[paragraph.id] || translationErrors[paragraph.id] || loadingTranslations.has(paragraph.id)) {
      return
    }

    setLoadingTranslations((prev) => {
      const updated = new Set(prev)
      updated.add(paragraph.id)
      return updated
    })
    setTranslationErrors((prev) => {
      const { [paragraph.id]: _removed, ...rest } = prev
      return rest
    })

    try {
      const result = await translateParagraphAction({
        text: paragraph.spanish,
      })
      setTranslations((prev) => ({
        ...prev,
        [paragraph.id]: result.translatedText,
      }))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unexpected error prevented translating this paragraph."
      setTranslationErrors((prev) => ({
        ...prev,
        [paragraph.id]: message,
      }))
    } finally {
      setLoadingTranslations((prev) => {
        const updated = new Set(prev)
        updated.delete(paragraph.id)
        return updated
      })
    }
  }

  const handleParagraphClick = (paragraph: Paragraph) => {
    const wasVisible = visibleTranslations.has(paragraph.id)
    setVisibleTranslations((prev) => {
      const updated = new Set(prev)
      if (updated.has(paragraph.id)) {
        updated.delete(paragraph.id)
      } else {
        updated.add(paragraph.id)
      }
      return updated
    })

    if (!wasVisible) {
      void ensureTranslation(paragraph)
    }
  }

  const handleWordClick = (word: string) => {
    const cleanWord = word.replace(/[.,;:!?"“”¿¡]/g, "")
    const definition = sampleDefinitions[cleanWord]
    if (!definition) {
      return
    }
    if (selectedWord?.word === definition.word) {
      setSelectedWord(null)
      return
    }
    setSelectedWord(definition)
    setActiveTab("translation")
  }

  const renderClickableText = (text: string, paragraphId: number) => {
    const words = text.split(" ")
    return (
      <span>
        {words.map((word, index) => {
          const cleanWord = word.replace(/[.,;:!?"“”¿¡]/g, "")
          const hasDefinition = sampleDefinitions[cleanWord]
          const punctuation = word.match(/[.,;:!?"“”¿¡]/g)?.join("") ?? ""

          return (
            <span key={`${paragraphId}-${index}`}>
              {hasDefinition ? (
                <span
                  className="cursor-pointer underline decoration-primary/40 decoration-2 underline-offset-4 transition-all duration-200 hover:text-primary hover:decoration-primary"
                  onClick={(event) => {
                    event.stopPropagation()
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

  const renderTranslationView = (paragraph: Paragraph) => {
    const spanishText = renderClickableText(paragraph.spanish, paragraph.id)
    const translatedText = translations[paragraph.id]
    const translationError = translationErrors[paragraph.id]
    const isLoading = loadingTranslations.has(paragraph.id)
    const translationBody = (() => {
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
        return translatedText
      }
      return paragraph.english
    })()

    return (
      <div className="relative animate-in zoom-in-95 duration-300">
        <div className="absolute -inset-4 rounded-2xl bg-primary/20 blur-xl" />
        <div className="relative rounded-2xl border-2 border-primary/50 bg-background/95 p-6 backdrop-blur-sm shadow-2xl shadow-primary/10">
          <div className="flex items-start gap-4">
            <div className="flex-1 space-y-4">
              <p className="font-serif text-lg leading-relaxed text-foreground">{spanishText}</p>
              <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
              <p className="text-lg leading-relaxed text-muted-foreground/90 animate-in fade-in-50 duration-300">
                {translationBody}
              </p>
            </div>
            <Button
              variant="default"
              size="icon"
              className="mt-1 h-9 w-9 shrink-0"
              onClick={() => handleParagraphClick(paragraph)}
            >
              <Link2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-card/50 px-6 py-4 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-accent"
          onClick={() => onBack?.()}
          aria-label="Go back"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{title ?? "Capítulo Seis"}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle ?? "1 Devorador de Almas"}</p>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="hover:bg-accent" aria-label="Help">
            <HelpCircle className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="hover:bg-accent" aria-label="More options">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-4xl space-y-6 px-6 py-8 pb-96">
          {paragraphs.map((paragraph) => {
            const hasTranslation = paragraph.spanish.trim().length > 0
            const isTranslationVisible = visibleTranslations.has(paragraph.id)

            return (
              <div
                key={paragraph.id}
                className={`transition-all duration-300 ${
                  hasVisibleTranslation && !isTranslationVisible ? "opacity-30 blur-[2px]" : "opacity-100 blur-0"
                }`}
              >
                {isTranslationVisible && hasTranslation ? (
                  renderTranslationView(paragraph)
                ) : (
                  <div className="group flex items-start gap-4">
                    <p className="flex-1 font-serif text-lg leading-relaxed text-foreground">
                      {renderClickableText(paragraph.spanish, paragraph.id)}
                    </p>
                    {hasTranslation && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mt-1 h-9 w-9 shrink-0 opacity-35 transition-all duration-200 hover:opacity-75"
                        onClick={() => handleParagraphClick(paragraph)}
                        aria-label="Show translation"
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
        <div className="fixed bottom-0 left-0 right-0 border-t bg-background shadow-2xl animate-in slide-in-from-bottom duration-300">
          <Card className="rounded-none border-0 border-t">
            <div className="flex items-center justify-between border-b px-6 py-5">
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
                onClick={() => setSelectedWord(null)}
                aria-label="Close definition panel"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="flex w-full justify-start gap-8 rounded-none border-b bg-transparent px-6">
                <TabsTrigger
                  value="translation"
                  className="rounded-none border-b-2 border-transparent px-0 py-4 font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Translation
                </TabsTrigger>
                <TabsTrigger
                  value="definitions"
                  className="rounded-none border-b-2 border-transparent px-0 py-4 font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  Definitions
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[50vh]">
                <TabsContent value="translation" className="mt-0 space-y-6 p-6">
                  <div className="flex flex-wrap gap-2">
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
                    <div className="flex items-center justify-between rounded-lg border bg-accent/50 p-4">
                      <h3 className="text-2xl font-light">{selectedWord.translations.main}</h3>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    {selectedWord.translations.alternatives.map((alternative, index) => (
                      <Card key={`${alternative.word}-${index}`} className="border-border/50 p-4 hover:border-border">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-baseline gap-2">
                              <span className="text-lg font-semibold">{alternative.word}</span>
                              <Badge variant="outline" className="text-xs">
                                {alternative.type}
                              </Badge>
                            </div>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                              {alternative.meanings.join(", ")}
                            </p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full">
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="definitions" className="mt-0 space-y-6 p-6">
                  <Card className="border-border/50 bg-accent/30 p-5">
                    <div className="space-y-4">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl font-semibold">{selectedWord.word}</span>
                        <Badge variant="outline" className="text-xs">
                          {selectedWord.type}
                        </Badge>
                      </div>
                      <p className="text-base leading-relaxed">{selectedWord.definitions.spanish}</p>

                      {selectedWord.definitions.related.length > 0 && (
                        <>
                          <Separator className="my-4" />
                          <div className="flex flex-wrap gap-2">
                            {selectedWord.definitions.related.map((word, index) => (
                              <Badge key={`${word}-${index}`} variant="secondary" className="rounded-full px-3 py-1">
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
                              <p key={`${example}-${index}`} className="border-l-2 pl-4 text-sm italic text-muted-foreground">
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
