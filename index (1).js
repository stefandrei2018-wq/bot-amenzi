const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, REST, Routes } = require('discord.js');

const CONFIG = {
  TOKEN: 'PUNE_TOKEN_BOT_AICI',
  CLIENT_ID: 'PUNE_CLIENT_ID_AICI',
  GUILD_ID: 'PUNE_GUILD_ID_AICI',
  CANAL_AMENZI: 'ID_CANAL_amenzi',
  CANAL_LOG: 'ID_CANAL_log-sindicat',
  CANAL_DOVEZI: 'ID_CANAL_dovada-plata',
  FAMILII: ['Los Vagos', 'Ballas', 'Aztecas', 'Grove Street', 'Mafia', 'Sindicat'],
  COOLDOWN_MS: 24 * 60 * 60 * 1000,
  CHECK_INTERVAL_MS: 60 * 1000,
};

const amenzi = new Map();
let ticketCounter = 1000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function genereazaId() {
  return 'AMZ-' + (++ticketCounter);
}

function embedAmenda(ticket) {
  const acum = Date.now();
  const ramas = ticket.deadline - acum;
  const ore = Math.max(0, Math.floor(ramas / 3600000));
  const minute = Math.max(0, Math.floor((ramas % 3600000) / 60000));

  let culoare, statusText, timerText;

  if (ticket.status === 'platit') {
    culoare = 0x57F287;
    statusText = '✅ Plătit';
    timerText = 'Achitat';
  } else if (ticket.warned) {
    culoare = 0xFF0000;
    statusText = '🚨 Faction Warn aplicat';
    timerText = 'Timp expirat';
  } else if (ticket.dublat) {
    culoare = 0xFF6B00;
    statusText = '🔴 DUBLAT — Faction warn urmează!';
    timerText = ore + 'h ' + minute + 'm rămase';
  } else if (ramas <= 0) {
    culoare = 0xFF6B00;
    statusText = '⚠️ Expirat';
    timerText = 'Expirat';
  } else {
    culoare = 0xED4245;
    statusText = '⏳ Neachitat';
    timerText = ore + 'h ' + minute + 'm rămase';
  }

  const embed = new EmbedBuilder()
    .setColor(culoare)
    .setTitle('Amenda — ' + ticket.familie)
    .addFields(
      { name: 'Ticket ID', value: '`' + ticket.id + '`', inline: true },
      { name: 'Dat de', value: '<@' + ticket.datDe + '>', inline: true },
      { name: 'Suma', value: '**' + ticket.suma + ' MLD**', inline: true },
      { name: 'Motiv', value: ticket.motiv, inline: false },
      { name: 'Status', value: statusText, inline: true },
      { name: 'Timer', value: timerText, inline: true },
    )
    .setFooter({ text: 'Sindicat • Sistem Amenzi' })
    .setTimestamp();

  if (ticket.dublat && ticket.sumaOriginala) {
    embed.addFields({ name: 'Suma originala', value: ticket.sumaOriginala + ' MLD', inline: true });
  }

  return embed;
}

async function verificaAmenzi() {
  const acum = Date.now();

  for (const [id, ticket] of amenzi) {
    if (ticket.status === 'platit') continue;

    if (!ticket.dublat && acum >= ticket.deadline) {
      ticket.sumaOriginala = ticket.suma;
      ticket.suma = ticket.suma * 2;
      ticket.dublat = true;
      ticket.deadlineDublat = acum + CONFIG.COOLDOWN_MS;

      const canalAmenzi = client.channels.cache.get(CONFIG.CANAL_AMENZI);
      if (canalAmenzi && ticket.mesajId) {
        try {
          const msg = await canalAmenzi.messages.fetch(ticket.mesajId);
          await msg.edit({ embeds: [embedAmenda(ticket)] });
        } catch (e) {}
      }
      if (canalAmenzi) {
        await canalAmenzi.send(
          'Amenda `' + ticket.id + '` pentru **' + ticket.familie + '** nu a fost platita! ' +
          'Suma s-a dublat la **' + ticket.suma + ' MLD**. Mai aveti 24h inainte de Faction Warn!'
        );
      }
      const canalLog = client.channels.cache.get(CONFIG.CANAL_LOG);
      if (canalLog) {
        await canalLog.send('Amenda `' + ticket.id + '` — **' + ticket.familie + '** — dublata la **' + ticket.suma + ' MLD**');
      }
    }

    if (ticket.dublat && !ticket.warned && acum >= ticket.deadlineDublat) {
      ticket.warned = true;

      const canalAmenzi = client.channels.cache.get(CONFIG.CANAL_AMENZI);
      if (canalAmenzi) {
        await canalAmenzi.send(
          '**FACTION WARN** — **' + ticket.familie + '** nu a achitat amenda `' + ticket.id + '` de **' + ticket.suma + ' MLD**! Warn aplicat automat.'
        );
      }
      if (canalAmenzi && ticket.mesajId) {
        try {
          const msg = await canalAmenzi.messages.fetch(ticket.mesajId);
          await msg.edit({ embeds: [embedAmenda(ticket)] });
        } catch (e) {}
      }
      const canalLog = client.channels.cache.get(CONFIG.CANAL_LOG);
      if (canalLog) {
        await canalLog.send('Faction Warn aplicat pentru **' + ticket.familie + '** — amenda `' + ticket.id + '` neachitata.');
      }
    }
  }
}

const comenzi = [
  new SlashCommandBuilder()
    .setName('amenda')
    .setDescription('Da o amenda unei familii')
    .addStringOption(opt =>
      opt.setName('familie').setDescription('Familia care primeste amenda').setRequired(true)
        .addChoices(...CONFIG.FAMILII.map(f => ({ name: f, value: f })))
    )
    .addIntegerOption(opt =>
      opt.setName('suma').setDescription('Suma in MLD').setRequired(true).setMinValue(1)
    )
    .addStringOption(opt =>
      opt.setName('motiv').setDescription('Motivul amenzii').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('amenzi_status')
    .setDescription('Amenzi neachitate ale unei familii')
    .addStringOption(opt =>
      opt.setName('familie').setDescription('Familia').setRequired(true)
        .addChoices(...CONFIG.FAMILII.map(f => ({ name: f, value: f })))
    ),

  new SlashCommandBuilder()
    .setName('ticket_info')
    .setDescription('Detalii despre un ticket')
    .addStringOption(opt =>
      opt.setName('ticket_id').setDescription('ID-ul tichetului').setRequired(true)
    ),
].map(cmd => cmd.toJSON());

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'amenda') {
    if (interaction.channelId !== CONFIG.CANAL_AMENZI) {
      return interaction.reply({ content: 'Foloseste `/amenda` doar in canalul #amenzi!', ephemeral: true });
    }

    const familie = interaction.options.getString('familie');
    const suma = interaction.options.getInteger('suma');
    const motiv = interaction.options.getString('motiv');

    const ticket = {
      id: genereazaId(),
      familie, suma, motiv,
      datDe: interaction.user.id,
      timestamp: Math.floor(Date.now() / 1000),
      deadline: Date.now() + CONFIG.COOLDOWN_MS,
      status: 'neplatit',
      dublat: false,
      warned: false,
      mesajId: null,
    };

    amenzi.set(ticket.id, ticket);

    const mesaj = await interaction.channel.send({ embeds: [embedAmenda(ticket)] });
    ticket.mesajId = mesaj.id;

    const canalLog = client.channels.cache.get(CONFIG.CANAL_LOG);
    if (canalLog) {
      await canalLog.send({ content: 'Amenda noua de la <@' + interaction.user.id + '>', embeds: [embedAmenda(ticket)] });
    }

    await interaction.reply({ content: 'Amenda `' + ticket.id + '` inregistrata pentru **' + familie + '**! Timer 24h pornit.', ephemeral: true });
  }

  else if (commandName === 'amenzi_status') {
    const familie = interaction.options.getString('familie');
    const neplatite = [...amenzi.values()].filter(t => t.familie === familie && t.status === 'neplatit');

    if (neplatite.length === 0) {
      return interaction.reply({ content: '**' + familie + '** nu are amenzi neachitate.', ephemeral: true });
    }

    const total = neplatite.reduce((s, t) => s + t.suma, 0);
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('Amenzi neachitate — ' + familie)
      .setDescription(neplatite.map(t => '`' + t.id + '` — **' + t.suma + ' MLD** — ' + t.motiv + (t.dublat ? ' DUBLAT' : '')).join('\n'))
      .addFields({ name: 'Total datorat', value: '**' + total + ' MLD**' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  else if (commandName === 'ticket_info') {
    const ticketId = interaction.options.getString('ticket_id').toUpperCase();
    const ticket = amenzi.get(ticketId);
    if (!ticket) return interaction.reply({ content: 'Ticketul `' + ticketId + '` nu exista.', ephemeral: true });
    await interaction.reply({ embeds: [embedAmenda(ticket)], ephemeral: true });
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.channelId !== CONFIG.CANAL_DOVEZI) return;
  if (!message.content.toLowerCase().startsWith('!plata')) return;

  const args = message.content.split(' ');
  const ticketId = args[1]?.toUpperCase();

  if (!ticketId) {
    return message.reply('Foloseste: `!plata AMZ-1001`');
  }

  const ticket = amenzi.get(ticketId);
  if (!ticket) return message.reply('Ticketul `' + ticketId + '` nu exista.');
  if (ticket.status === 'platit') return message.reply('Amenda `' + ticketId + '` e deja platita.');

  ticket.status = 'platit';
  ticket.platitDe = message.author.id;

  const canalAmenzi = client.channels.cache.get(CONFIG.CANAL_AMENZI);
  if (canalAmenzi && ticket.mesajId) {
    try {
      const msg = await canalAmenzi.messages.fetch(ticket.mesajId);
      await msg.edit({ embeds: [embedAmenda(ticket)] });
    } catch (e) {}
  }

  const embedConfirmare = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('Plata confirmata — ' + ticket.familie)
    .addFields(
      { name: 'Ticket', value: '`' + ticket.id + '`', inline: true },
      { name: 'Suma achitata', value: ticket.suma + ' MLD', inline: true },
      { name: 'Confirmat de', value: '<@' + message.author.id + '>', inline: true },
    )
    .setTimestamp();

  await message.reply({ embeds: [embedConfirmare] });

  const canalLog = client.channels.cache.get(CONFIG.CANAL_LOG);
  if (canalLog) {
    await canalLog.send('Amenda `' + ticketId + '` achitata de <@' + message.author.id + '> — **' + ticket.familie + '** — ' + ticket.suma + ' MLD');
  }
});

client.once('ready', async () => {
  console.log('Bot conectat ca ' + client.user.tag);

  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
  await rest.put(Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID), { body: comenzi });
  console.log('Comenzi slash inregistrate!');

  setInterval(verificaAmenzi, CONFIG.CHECK_INTERVAL_MS);
  console.log('Loop verificare amenzi pornit (interval: 1 min)');
});

client.login(CONFIG.TOKEN);
