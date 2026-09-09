# Press, blogs and newsletters

The Tesla news sites cover browser apps as a matter of course — a free page that runs on the
car screen is the kind of thing they already write about — so this does not need a news hook
so much as a reason to be interesting this week.

**On the gate.** [distribution.md](../distribution.md) puts press behind the filmed clip, and
the reasoning holds: the question these outlets are really asking is "are people out there
doing this", and nothing generated answers it. But it is a gate against pitching _empty
handed_, not a gate against pitching at all. The generated clip — the real client, the real
hub, only the GPS simulated (ADR-0038) — answers "what is this" well enough for a browser-app
story, and it exists today. Send it as what it is, labelled a screen recording, every time.
When the filmed clip exists, the same outlets are worth a second, better pitch.

## Before pitching anything

A press hit is the one day the app must not go dark, and three of these are unfinished:

1. **Analytics.** `VITE_CF_BEACON_TOKEN` set as a repository variable and the branch merged,
   or the referrers from the article are lost and the whole point of picking a channel is
   lost with them.
2. **Headroom.** Read the cost invariants in the README, and know where the `WS_ENABLED` kill
   switch is before you need it, not after. Run `pnpm usage` the morning after publication.
3. **Somewhere to land.** Post in [french-community.md](french-community.md) first. An
   article sends strangers to a map; a forum thread from the week before means some of them
   find somebody on it, and it means you have real replies to quote instead of adjectives.

## The targets

English-language, in the order they are worth pitching:

| Outlet                                                     | Route                    | Note                                                                                                                             |
| ---------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| [Not a Tesla App](https://www.notateslaapp.com/contact-us) | contact form             | The best fit on the list: it covers software, tips and browser apps constantly, and its readers are owners rather than investors |
| [Tesletter](https://tesletter.com/)                        | newsletter, replies read | Small, personal, and it already tags browser-app coverage. A newsletter mention converts better than a big site's news post      |
| [Teslarati](https://www.teslarati.com/)                    | tips address on the site | Bigger, more investor-facing, less likely to care about a browser page                                                           |
| [Electrek](https://electrek.co/)                           | tips address on the site | Same, plus a wider EV audience who mostly do not drive a Tesla                                                                   |
| YouTube channels reviewing in-car software                 | channel contact          | The clip is the whole pitch here; hold until it is filmed                                                                        |

French-language, which for a French-first launch outrank most of the above:

| Outlet                                                                         | Note                                                                                          |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| [Tesla Mag](https://www.tesla-mag.com/)                                        | French, Tesla-specific, the closest match in the language the launch is happening in          |
| [Automobile Propre](https://www.automobile-propre.com/)                        | The reference French EV site, with a large owner readership                                   |
| [Frandroid](https://www.frandroid.com/), [Numerama](https://www.numerama.com/) | Tech rather than car press: "a live map on a free tier, in the car's browser" is a tech story |
| [L'Argus](https://www.largus.fr/), [Caradisiac](https://www.caradisiac.com/)   | General car press. Wide, shallow, and last                                                    |

Pitch one at a time and wait. Two outlets running the same piece in the same week is worth
less than one that ran it because it wanted to.

## The pitch

**Subject:** The Tesla wave, as a live map in the car browser

> Hello — I built a free page that runs in the Tesla in-car browser and shows the other
> Teslas around you on a live map. When one comes within 300 m, a button comes up and you can
> wave; their screen says who waved and offers to wave back. No install, no account, no app
> store: it is one page, set up on the phone and moved to the car with a six-character code.
>
> The clip attached is a screen recording of the app running against itself — the real client
> and the real hub over a real socket, with only the GPS simulated. I have not filmed two
> real cars crossing yet, and I would rather say so than let it be assumed.
>
> What might make it worth a piece:
>
> - It is the physical Tesla wave, which owners already do, made into something that lands.
> - Positions are never written to a database. They live in memory for a minute and are gone;
>   only wave counts are stored. A car parked ten minutes hides itself.
> - It runs on a free hosting tier and costs nothing, which is why it can stay free.
> - It is built for the car's browser rather than ported to it, and open source under Apache
>   2.0: github.com/Meg4mi/teslawave
>
> Tested on a Model Y Juniper. Older MCU 2 cars have not been tested yet, and I say that in
> the app's own notes as well.
>
> Happy to answer anything or give you a walkthrough. Images and the clip: <link>
>
> Independent project. Not affiliated with, endorsed or sponsored by Tesla, Inc.
> TESLA is a trademark of Tesla, Inc.

## Le pitch (français)

**Objet :** Le petit signe entre Tesla, en carte temps réel dans le navigateur de la voiture

> Bonjour — j'ai développé une page gratuite qui tourne dans le navigateur de la Tesla et qui
> affiche les autres Tesla autour de vous sur une carte en direct. Quand l'une passe à moins
> de 300 m, un bouton apparaît et vous lui faites signe ; son écran affiche qui a fait signe
> et propose de répondre. Rien à installer, aucun compte : une seule page, qu'on configure
> sur le téléphone et qu'on transfère à la voiture avec un code à six caractères.
>
> La vidéo jointe est une capture d'écran de l'application qui se croise elle-même — le vrai
> client et le vrai serveur sur une vraie connexion, seul le GPS est simulé. Je n'ai pas
> encore filmé deux voitures réelles qui se croisent, et je préfère le préciser.
>
> Ce qui peut en faire un sujet :
>
> - C'est le signe de la main entre conducteurs, que les propriétaires font déjà, rendu fiable.
> - La position n'est jamais écrite dans une base de données : une minute en mémoire, puis
>   plus rien. Seuls les compteurs de signes sont conservés. Une voiture à l'arrêt depuis dix
>   minutes se masque toute seule.
> - Ça tourne sur un hébergement gratuit et ne coûte rien, ce qui est la raison pour laquelle
>   ça peut rester gratuit.
> - C'est pensé pour l'écran de la voiture, et open source sous Apache 2.0 :
>   github.com/Meg4mi/teslawave
>
> Testé sur un Model Y Juniper. Les MCU 2 plus anciens ne l'ont pas encore été, et c'est écrit
> tel quel dans les notes du projet.
>
> Je réponds volontiers à toute question. Images et vidéo : <lien>
>
> Projet indépendant. Non affilié à Tesla, Inc., ni approuvé ni sponsorisé par elle.
> TESLA est une marque de Tesla, Inc.

## The kit

- The generated clip (`pnpm gen:demo`), **labelled a screen recording**, and the filmed one
  when it exists.
- `docs/images/car-screen.jpg`, `docs/images/phone.png`, `docs/images/choose.png`.
- `apps/web/public/og.png`.
- The long description from [directories.md](directories.md).
- The disclaimer, as text they can paste.

## Things to refuse

- **Any framing that reads official.** Not "the new Tesla app", not a piece with the logo on
  it. Ask for the correction before publication, and check the piece when it runs.
- **User numbers you cannot stand behind.** `/api/stats` counts waves. Give that number, do
  not convert it into "users", and do not round it upward.
- **A claim that it runs on any Tesla.** One Juniper is one data point.
- **Anything a driver did not consent to being filmed.** No plates, no faces, no home.
