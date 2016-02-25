var Globalize = require( "globalize" );
var startTime = new Date();

// Standalone table.
var numberFormatter = Globalize.numberFormatter({ maximumFractionDigits: 2 });
var currencyFormatter = Globalize.currencyFormatter( "USD" );
var dateFormatter = Globalize.dateFormatter({ datetime: "medium" });
var relativeTimeFormatter = Globalize.relativeTimeFormatter( "second" );
var unitFormatter = Globalize.unitFormatter( "mile/hour", { form: "short" } );

if(typeof document !== "undefined") {
	document.getElementById( "number" ).textContent = numberFormatter( 555 );
	document.getElementById( "currency" ).textContent = currencyFormatter( 69900 );
	document.getElementById( "date" ).textContent = dateFormatter( new Date() );
	document.getElementById( "relative-time" ).textContent = relativeTimeFormatter( 0 );
	document.getElementById( "unit" ).textContent = unitFormatter( 60 );
	
	// Messages.
	document.getElementById( "intro-1" ).textContent = Globalize.formatMessage( "intro-1" );
	document.getElementById( "number-label" ).textContent = Globalize.formatMessage( "number-label" );
	document.getElementById( "currency-label" ).textContent = Globalize.formatMessage( "currency-label" );
	document.getElementById( "date-label" ).textContent = Globalize.formatMessage( "date-label" );
	document.getElementById( "relative-time-label" ).textContent = Globalize.formatMessage( "relative-time-label" );
	document.getElementById( "unit-label" ).textContent = Globalize.formatMessage( "unit-label" );
	document.getElementById( "message-1" ).textContent = Globalize.formatMessage( "message-1", {
		currency: currencyFormatter( 69900 ),
		date: dateFormatter( new Date() ),
		number: numberFormatter( 12345.6789 ),
		relativeTime: relativeTimeFormatter( 0 ),
		unit: unitFormatter( 60 )
	});
	
	document.getElementById( "message-2" ).textContent = Globalize.formatMessage( "message-2", {
		count: 3
	});
	
	// Display demo.
	document.getElementById( "requirements" ).style.display = "none";
	document.getElementById( "demo" ).style.display = "block";
	
	// Refresh elapsed time
	setInterval(function() {
		var elapsedTime = +( ( startTime - new Date() ) / 1000 ).toFixed( 0 );
		document.getElementById( "date" ).textContent = dateFormatter( new Date() );
		document.getElementById( "relative-time" ).textContent = relativeTimeFormatter( elapsedTime );
		document.getElementById( "message-1" ).textContent = Globalize.formatMessage( "message-1", {
			currency: currencyFormatter( 69900 ),
			date: dateFormatter( new Date() ),
			number: numberFormatter( 12345.6789 ),
			relativeTime: relativeTimeFormatter( elapsedTime ),
			unit: unitFormatter( 60 )
		});
	
	}, 1000);
} else {
	console.log("setting 'number' to " + numberFormatter( 555 ));
	console.log("setting 'currency' to " + currencyFormatter( 69900 ));
	console.log("setting 'date' to " + dateFormatter( new Date() ));
	console.log("setting 'relative-time' to " + relativeTimeFormatter( 0 ));
	console.log("setting 'unit' to " + unitFormatter( 60 ));
	
	// Messages.
	console.log("setting 'intro-1' to " + Globalize.formatMessage( "intro-1" ));
	console.log("setting 'number-label' to " + Globalize.formatMessage( "number-label" ));
	console.log("setting 'currency-label' to " + Globalize.formatMessage( "currency-label" ));
	console.log("setting 'date-label' to " + Globalize.formatMessage( "date-label" ));
	console.log("setting 'relative-time-label' to " + Globalize.formatMessage( "relative-time-label" ));
	console.log("setting 'unit-label' to " + Globalize.formatMessage( "unit-label" ));
	console.log("setting 'message-1' to " + Globalize.formatMessage( "message-1", {
		currency: currencyFormatter( 69900 ),
		date: dateFormatter( new Date() ),
		number: numberFormatter( 12345.6789 ),
		relativeTime: relativeTimeFormatter( 0 ),
		unit: unitFormatter( 60 )
	}));
	
	console.log("setting 'message-2' to " + Globalize.formatMessage( "message-2", {
		count: 3
	}));
}
