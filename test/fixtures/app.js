"use strict";

const Globalize = require( "globalize" );
let like;

// Use Globalize to format dates.
Globalize.formatDate( new Date(), { datetime: "medium" } );
Globalize.formatDateToParts( new Date(), { date: "long" } );

// Use Globalize to format numbers.
Globalize.formatNumber( 12345.6789 );

// Use Globalize to format currencies.
Globalize.formatCurrency( 69900, "USD" );

// Use Globalize to get the plural form of a numeric value.
Globalize.plural( 12345.6789 );

// Use Globalize to format a message with plural inflection.
like = Globalize.messageFormatter( "like" );
like( 0 );
like( 1 );
like( 2 );
like( 3 );

// Use Globalize to format relative time.
Globalize.formatRelativeTime( -35, "second" );

// Use Globalize to format unit.
Globalize.formatUnit( 60, "mile/hour", { form: "short" } );

// Use Globalize to parse a number.
Globalize.parseNumber( "12345.6789" );

// Use Globalize to parse a date.
Globalize.parseDate( "1/2/1982" );
