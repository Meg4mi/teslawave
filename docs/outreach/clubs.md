# Tesla Owners Clubs

Tier 2, and the highest-leverage thing on the whole list. A club drive is a dozen cars on
the same road for an afternoon: every car crosses every other car, every driver gets the
wave, and the product stops needing to be explained. It is also where the filmed clip gets
made, which is what unblocks tiers 5 and 6.

Approach the organiser directly, not the club's public wall. And offer it as _something to
run during the drive_, never as a pitch to be announced.

## The first message to an organiser

> Hello — I am an owner in <region> and I have built a small free thing that I think would
> work well on one of your drives.
>
> It is a live map of the Teslas around you that runs in the car's own browser, no install
> and no account. When another car with it open comes within 300 m, a button comes up and you
> can wave at them; their screen says who waved and offers to wave back. On a normal commute
> that almost never happens, because there are not enough of us yet. On a drive with a dozen
> cars it happens constantly, which is the only setting where the thing is really itself.
>
> What I would ask is nothing from the club: no announcement, no endorsement. Just permission
> to share a link with whoever wants it on the day, and two minutes at the meeting point to
> help people get it onto their car screen. It is set up on the phone first and moved to the
> car with a six-character code, so it takes about a minute per car.
>
> If it is useful I would love to film thirty seconds of two cars waving at each other, with
> the consent of whoever is driving them, and I will not put anybody's plate, face or
> location in it. Happy to show you the whole thing first, and it is open source if you want
> to read it: github.com/Meg4mi/teslawave
>
> Independent project. Not affiliated with, endorsed or sponsored by Tesla, Inc.
> TESLA is a trademark of Tesla, Inc.

## Le premier message à un organisateur (français)

> Bonjour — je suis propriétaire dans la région de <région> et j'ai développé un petit truc
> gratuit qui irait bien, je crois, sur une de vos sorties.
>
> C'est une carte en direct des Tesla autour de vous, qui tourne dans le navigateur de la
> voiture, sans installation ni compte. Quand une autre voiture qui l'a ouvert passe à moins
> de 300 m, un bouton apparaît et vous pouvez lui faire signe ; son écran affiche qui a fait
> signe et propose de répondre. Sur un trajet quotidien ça n'arrive presque jamais, parce que
> nous ne sommes pas encore assez nombreux. Sur une sortie à douze voitures, ça arrive sans
> arrêt, et c'est la seule situation où la chose est vraiment elle-même.
>
> Je ne demande rien au club : ni annonce, ni caution. Juste l'autorisation de partager un
> lien avec ceux que ça intéresse le jour même, et deux minutes au point de rendez-vous pour
> aider à l'installer sur l'écran. Ça se configure sur le téléphone puis se transfère à la
> voiture avec un code à six caractères, donc environ une minute par voiture.
>
> Si c'est utile, j'aimerais filmer trente secondes de deux voitures qui se font signe, avec
> l'accord des conducteurs, et sans plaque, ni visage, ni lieu dans l'image. Je peux vous
> montrer le tout avant, et c'est open source si vous voulez le lire :
> github.com/Meg4mi/teslawave
>
> Projet indépendant. Non affilié à Tesla, Inc., ni approuvé ni sponsorisé par elle.
> TESLA est une marque de Tesla, Inc.

## On the day

- **Set up at the meeting point, not on the road.** Everyone is stopped, everyone has their
  phone out, and nobody is trying to type on a screen in traffic.
- **Phone first, then the code.** Have `teslawave.app` ready to show, and expect to do the
  first two cars yourself while people watch.
- **Say the safety line out loud**, in the words the app uses: the road comes first, a wave
  is worth a glance and no more, and where the law says a screen is not touched while moving,
  it is not.
- **Filming needs asking, per car, on the day.** No plates, no faces, no location. If anyone
  says no, the clip is made with the cars that said yes or it is not made.
- **Write the rows.** A drive is the largest batch of real-car evidence this project will
  ever get in one afternoon: cold load time, frame rate, whether geolocation prompted at all,
  and which car and firmware each was. Every row goes in [tesla-notes.md](../tesla-notes.md),
  and the failures are the useful part. Ask people to turn on Settings → Share performance
  data as well, and read it back with `pnpm perf`.
- **Watch the counters that evening.** `pnpm usage` the next morning, without fail: a drive
  is the first time the hub has ever had a dozen sockets in one cell.

## If there is no club within reach

A club is a means, not the goal. What it supplies is one thing: **several cars on the same
roads at the same time, on a date somebody agreed in advance.** That can be assembled without
one, and none of these needs anybody's permission.

**Check the national club before concluding there is none.** The clubs are usually national or
regional rather than municipal, with informal chapters that never show up as a local listing.
A country-level club with a members' group is the same offer, made to whoever runs the group.

**Organise the drive yourself.** Three or four owners and a date is a club drive without a
club, and three cars is enough for everyone to cross everyone. In a regional owner group:

> Anybody up for a short drive on <day>? Meeting at <place> at <time>, coffee first, about
> forty minutes on the <road>, home by <time>. I have built a thing that shows the Teslas
> around you and lets you wave at them, and it needs a few cars on the same road to be worth
> anything. Happy to help everyone set it up at the meeting point. No obligation to keep it
> afterwards.

That message is doing the work a club would have done, and it is a better first impression
than a link, because you are offering people a morning out rather than an app.

**Superchargers are where the density already is — and the one place the app hides you.**
A car stopped for ten minutes is hidden until it moves (ADR-0026), which is deliberate and
right, and it means a Supercharger is not somewhere to demonstrate the live map. It is the
best place there is to **hand out the link**: drivers are stationary, bored, holding their
phone, and every one of them owns the car. Set it up on their phone there, and the map does
its work on the drive home. Do not stand there expecting the screen to show the six cars you
can see out of the window: after ten minutes it will show none of them, and explaining that
is a worse first impression than not showing the map at all.

**Pick a corridor instead of a region.** One commuter road at one time of day concentrates
far better than a city does. A dozen drivers who all use the same motorway at 8am is denser,
in the only sense that matters, than two hundred spread across a canton.

**Cars and coffee, EV meets, charging-network events.** Not Tesla-specific, and that is fine:
the owners are there, and the organisers are usually glad of something to do.

**National EV associations.** They run events, they have regional groups, and they are far
easier to approach than a brand club.

The order does not change: one region, then the next. Without a club the first step is simply
the owner group ([owner-groups.md](owner-groups.md)), and the drive is something you propose
there rather than something you are invited to.

## After the drive

The club gets the result whether or not it went well, in one message: how many cars, how many
waves, what broke. A club that is told what broke is a club that will run it again.
