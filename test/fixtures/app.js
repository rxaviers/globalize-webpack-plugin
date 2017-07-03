var like;
var Globalize = require( "globalize" );

// Use Globalize to format dates.
console.log( Globalize.formatDate( new Date(), { datetime: "medium" } ) );
console.log( Globalize.formatDate( new Date(), {
  datetime: "full",
  timeZone: "America/Sao_Paulo"
}));
console.log( Globalize.formatDateToParts( new Date(), { date: "long" } ) );

// Use Globalize to format numbers.
console.log( Globalize.formatNumber( 12345.6789 ) );

// Use Globalize to format currencies.
console.log( Globalize.formatCurrency( 69900, "USD" ) );

// Use Globalize to get the plural form of a numeric value.
console.log( Globalize.plural( 12345.6789 ) );

// Use Globalize to format a message with plural inflection.
like = Globalize.messageFormatter( "like" );
console.log( like( 0 ) );
console.log( like( 1 ) );
console.log( like( 2 ) );
console.log( like( 3 ) );

// Use Globalize to format relative time.
console.log( Globalize.formatRelativeTime( -35, "second" ) );

// Use Globalize to format unit.
console.log( Globalize.formatUnit( 60, "mile/hour", { form: "short" } ) );

// Use Globalize to parse a number.
console.log( Globalize.parseNumber( "12345.6789" ) );

// Use Globalize to parse a date.
console.log( Globalize.parseDate( "1/2/1982" ) );
console.log( Globalize.parseDate( "January 1, 2000 at 12:00:00 AM EST", {
  datetime: "long",
  timeZone: "America/New_York"
}));
