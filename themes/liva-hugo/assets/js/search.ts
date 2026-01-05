declare var Fuse: any;
declare var $: any;
declare var indexURL: string;

let summaryInclude = 60;
let fuseOptions = {
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

let searchQuery = param("s");
if (searchQuery) {
    $("#search-query").val(searchQuery);
    executeSearch(searchQuery);
}

function executeSearch(searchQuery: string): void {
    $.getJSON(indexURL, function (data: any[]) {
        let pages = data;
        let fuse = new Fuse(pages, fuseOptions);
        let result = fuse.search(searchQuery);
        console.log({ "matches": result });
        if (result.length > 0) {
            populateResults(result, searchQuery);
        } else {
            $('#search-results').append("<div class=\"text-center\"><img class=\"img-fluid mb-5\" src=\"https://user-images.githubusercontent.com/37659754/64060567-7cece400-cbf0-11e9-9cf9-abac3543ec1f.png\"><h3>No Search Found</h3></div>");
        }
    });
}

function populateResults(result: any[], searchQuery: string): void {
    $.each(result, function (key: string | number, value: any) {
        let contents = value.item.contents;
        let snippet = "";
        let snippetHighlights: string[] = [];

        if (fuseOptions.tokenize) {
            snippetHighlights.push(searchQuery);
        } else {
            $.each(value.matches, function (matchKey: any, mvalue: any) {
                if (mvalue.key == "tags" || mvalue.key == "categories") {
                    snippetHighlights.push(mvalue.value);
                } else if (mvalue.key == "contents") {
                    let start = mvalue.indices[0][0] - summaryInclude > 0 ? mvalue.indices[0][0] - summaryInclude : 0;
                    let end = mvalue.indices[0][1] + summaryInclude < contents.length ? mvalue.indices[0][1] + summaryInclude : contents.length;
                    snippet += contents.substring(start, end);
                    snippetHighlights.push(mvalue.value.substring(mvalue.indices[0][0], mvalue.indices[0][1] - mvalue.indices[0][0] + 1));
                }
            });
        }

        if (snippet.length < 1) {
            snippet += contents.substring(0, summaryInclude * 2);
        }

        //pull template from hugo templarte definition
        let templateDefinition = $('#search-result-template').html();
        if (templateDefinition) {
            //replace values
            let output = render(templateDefinition, {
                key: key,
                title: value.item.title,
                link: value.item.permalink,
                tags: value.item.tags,
                categories: value.item.categories,
                snippet: snippet,
                image: value.item.image,
                date: value.item.date,
                readingTime: value.item.readingTime,
                summary: value.item.summary
            });
            $('#search-results').append(output);

            $.each(snippetHighlights, function (snipkey: any, snipvalue: string) {
                ($("#summary-" + key) as any).mark(snipvalue);
            });
        }
    });
}

function param(name: string): string {
    return decodeURIComponent((location.search.split(name + '=')[1] || '').split('&')[0]).replace(/\+/g, ' ');
}

function render(templateString: string, data: any): string {
    // 1. Handle simple variables: ${key}
    // Matches any word characters inside ${ }
    let variablePattern = /\$\{\s*([a-zA-Z0-9_]*)\s*\}/g;
    templateString = templateString.replace(variablePattern, function (match, key) {
        return (data[key] !== undefined && data[key] !== null) ? data[key] : "";
    });

    return templateString;
}
