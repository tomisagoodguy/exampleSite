summaryInclude = 60;
var fuseOptions = {
  shouldSort: true,
  includeMatches: true,
  threshold: 0.0,
  tokenize: true,
  location: 0,
  distance: 100,
  maxPatternLength: 32,
  minMatchCharLength: 1,
  keys: [
    { name: "title", weight: 0.8 },
    { name: "contents", weight: 0.5 },
    { name: "tags", weight: 0.3 },
    { name: "categories", weight: 0.3 }
  ]
};


var searchQuery = param("s");
if (searchQuery) {
  $("#search-query").val(searchQuery);
  executeSearch(searchQuery);
}



function executeSearch(searchQuery) {
  $.getJSON(indexURL, function (data) {
    var pages = data;
    var fuse = new Fuse(pages, fuseOptions);
    var result = fuse.search(searchQuery);
    console.log({ "matches": result });
    if (result.length > 0) {
      populateResults(result);
    } else {
      $('#search-results').append("<div class=\"text-center\"><img class=\"img-fluid mb-5\" src=\"https://user-images.githubusercontent.com/37659754/64060567-7cece400-cbf0-11e9-9cf9-abac3543ec1f.png\"><h3>No Search Found</h3></div>");
    }
  });
}

function populateResults(result) {
  $.each(result, function (key, value) {
    var contents = value.item.contents;
    var snippet = "";
    var snippetHighlights = [];
    var tags = [];
    if (fuseOptions.tokenize) {
      snippetHighlights.push(searchQuery);
    } else {
      $.each(value.matches, function (matchKey, mvalue) {
        if (mvalue.key == "tags" || mvalue.key == "categories") {
          snippetHighlights.push(mvalue.value);
        } else if (mvalue.key == "contents") {
          start = mvalue.indices[0][0] - summaryInclude > 0 ? mvalue.indices[0][0] - summaryInclude : 0;
          end = mvalue.indices[0][1] + summaryInclude < contents.length ? mvalue.indices[0][1] + summaryInclude : contents.length;
          snippet += contents.substring(start, end);
          snippetHighlights.push(mvalue.value.substring(mvalue.indices[0][0], mvalue.indices[0][1] - mvalue.indices[0][0] + 1));
        }
      });
    }

    if (snippet.length < 1) {
      snippet += contents.substring(0, summaryInclude * 2);
    }
    //pull template from hugo templarte definition
    var templateDefinition = $('#search-result-template').html();
    //replace values
    var output = render(templateDefinition, {
      key: key,
      title: value.item.title || "",
      link: value.item.permalink || "",
      tags: (value.item.tags || []).join(", "),
      categories: (value.item.categories || []).join(", "),
      snippet: snippet || "",
      image: value.item.image || "",
      date: value.item.date || "",
      readingTime: value.item.readingTime || "",
      summary: value.item.summary || ""
    });
    $('#search-results').append(output);

    $.each(snippetHighlights, function (snipkey, snipvalue) {
      $("#summary-" + key).mark(snipvalue);
    });

  });
}

function param(name) {
  return decodeURIComponent((location.search.split(name + '=')[1] || '').split('&')[0]).replace(/\+/g, ' ');
}

function render(templateString, data) {
  // 1. Handle simple variables: ${key}
  // Matches any word characters inside ${ }
  var variablePattern = /\$\{\s*([a-zA-Z0-9_]*)\s*\}/g;
  templateString = templateString.replace(variablePattern, function (match, key) {
    return (data[key] !== undefined && data[key] !== null) ? data[key] : "";
  });

  return templateString;
}
