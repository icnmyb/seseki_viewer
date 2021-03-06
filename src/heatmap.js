(function($) {

  var ua = navigator.userAgent; // ユーザーエージェントを代入
  var isIE = false;
  var isEdge = false;
  if (ua.match("MSIE") || ua.match("Trident")) {
    isIE = true;
  }
  if (ua.match("Edge")){
    isEdge = true;
  }
  var captions = ['title', 'subtitle', 'subsubtitle'];
  function update_legend(legendContainer, options){
    var domain = options.color_scale.domain();
    var format_str;
    if(options.format_str) format_str = options.format_str;
    else format_str = (domain[0]%1===0 && domain[1]%1===0? ',.0f' : '0.2f' );
    var legend = d3.legend.color()
      .cells(11)
      .shapeWidth(50)
      .labelFormat(d3.format(format_str))
      .scale(options.color_scale);
    legendContainer.call(legend);
  }
  var methods = {
    init : function(option, callback){
      var _this = this;
      var defaults = {
        geodata_files : [],
        ref_size : {
          width :  420,
          height:  330,
          scale : 3200
        },
        exceptions:["色丹郡色丹村","国後郡泊村","国後郡留夜別村","択捉郡留別村","紗那郡紗那村","蘂取郡蘂取村", "所属未定地"],
        title : 'title',
        subtitle : 'subtitle',
        subsubtitle : 'subsubtitle',
        caption_sizes : [32,20,20],
        map_filler : function(d){return '#ffffff'},
        stroke_filler: "hsl(80,100%,0%)",
        on_click : null,
        eachfeature : function(p,x,l){l.bindTooltip(x.name)},
        show_legend : true,
        max_width : null,
        save_button : true,
        save_filename : 'heatmap'
      };
      var envs = {};
      var options = $.extend(defaults,option);
      _this[0].japaneseMapOpts = options;
      _this[0].japaneseMapEnvs = envs;
      var selector = this.selector;
      var geodata;
      var communes = [];
      var id_map = {};

      // 複数ファイルを非同期読み込み
      var promises = [];
      options.geodata_files.forEach(function(d){
        var p = new Promise(function(resolve, reject){
            d3.json(d, function(error, data){
              load_finished(error, data, resolve, reject);
            });
        });
        promises.push(p);
      });
      // 読み込み処理
      function load_finished(error, loaded, resolve, reject){
        if(error){
          reject(error);
          return;
        }
        // TopoJSONデータ展開
        var geodata_fieldname = Object.keys(loaded.objects)[0];
        geojson = topojson.feature(loaded, loaded.objects[geodata_fieldname]);
        var exception_communes = options.exceptions; // 対象外の市町村
        var remove_list = [];
        var communes = [];
        function register(k,v){
          if(!id_map[k]) id_map[k] = [];
          if(id_map[k].indexOf(v) == -1) id_map[k].push(v);
        }
        geojson.features.forEach(function(d,i){
          // 国土数値情報　行政区域データ向けのパーサ

          if(d.properties.N03_007=="") return; // 所属未定地等IDがないものは飛ばす

          // 市町村名を整理する
          d.commune_id = +d.properties.N03_007; // IDを代入
          d.prefecture = d.properties.N03_001;
          d.name = '';
          if(d.properties.N03_003) d.name += d.properties.N03_003;
          if(d.properties.N03_004) d.name += d.properties.N03_004;

          if(exception_communes.indexOf(d.name) != -1){
            // 除外リストに存在すれば削除フラグを付与する
            remove_list.unshift(i);
          }
          else{
            // 除外リストになければ市町村一覧に追加
            if(communes.indexOf(d.name) == -1) communes.push(d.name);
          }

          // CSVの市町村名から白地図のIDに変換するmapを自動生成する
          // 政令指定都市 or 郡
          if(d.properties.N03_003){
            // 政令指定都市または郡単位でひと塗りとする
            register(d.properties.N03_003, d.commune_id);
            // 町村・区単位を連結する
            register(d.name, d.commune_id);
            // 郡の場合は町村のみにできるようにする
            if(d.properties.N03_003.slice(-1)=="郡"){
              register(d.properties.N03_004, d.commune_id);
            }
          }
          // 市
          if(d.properties.N03_004){
              register(d.properties.N03_004, d.commune_id);
          }
        });
        // 対象外の市町村を削除
        remove_list.forEach(function(d){
          geojson.features.splice(d,1);
        });        

        // 割り切り 同じ市町村名があると区別できない
        resolve({geojson:geojson,communes:communes,id_map:id_map});
      }

      // 処理開始
      Promise.all(promises).then(ready);
      function ready(results){
        results.forEach(function(d){
          if(!geodata) geodata = d.geojson;
          else geodata.features = geodata.features.concat(d.geojson.features);
          communes = communes.concat(d.communes);
          Object.keys(d.id_map).forEach(function(x){
            id_map[x] = d.id_map[x];
          });
        });
        _this[0].japaneseMapCommunes = communes;
        _this[0].japaneseMapIdMap = id_map;
        display();
      }

      function display(){
        var projection, path;

        options.geodata = geodata;
        // Leaflet起動
        var centroid = d3.geo.centroid(geodata);
        var bounds = d3.geo.bounds(geodata);
        var leafletObj = L.map('leaflet_map',{
          zoom: 7,
          minZoom: 4,
          maxZoom: 18,
          center:[centroid[1],centroid[0]]
        });
        var osmUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        var osmAttrib = '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors';
        var osmOption = {attribution: osmAttrib, opacity:0.2};
        L.tileLayer(osmUrl, osmOption).addTo(leafletObj);
        var geoJsonLayer = L.geoJson(geodata, {
          style: function(d){
            return {
              color:"#222",
              weight:0.3,
              opacity: 0.6,
              fillOpacity: 0.6,
              fillColor: options.map_filler(d)
            }
          },
          onEachFeature: function(d,l){
            options.eachfeature(geoJsonLayer, d, l);
          }
        }).addTo(leafletObj);
        // 拡大縮小ボタン位置変更
        leafletObj.zoomControl.setPosition('bottomright');
        // 権利情報追記
        leafletObj.attributionControl.addAttribution( '&copy; <a href="http://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03.html">国土数値情報 行政区域データ</a>' );
        leafletObj.attributionControl.addAttribution( 'CC BY NC SA 4.0 <a href="https://github.com/colspan">Miyoshi(@colspan)</a> <a href="https://github.com/colspan/seseki_viewer">Seseki</a>' );

        envs.geoJsonLayer = geoJsonLayer;
        // 凡例
        var legendContainer;
        var legendWindow = L.Control.extend({
          options: {
            position: 'bottomleft'
          },
          onAdd: function (map) {
            var container = L.DomUtil.create('div', 'legendWindow');

            // 凡例作成
            legendContainer = d3.select(container).append('svg')
              .attr("class", "legendQuant")
              .attr("preserveAspectRatio", "xMinYMax meet");
            if(options.show_legend && options.color_scale){
              update_legend(legendContainer, options);
            }
            envs.legendContainer = legendContainer;

            return container;
          }
        });
        leafletObj.addControl(new legendWindow());

        // データ説明枠
        var captionWindow = L.Control.extend({
          options: {
            position: 'topleft'
          },
          onAdd: function(map){
            var container = L.DomUtil.create('div', 'captionWindow');

            // Caption
            var captionContainer = d3.select(container);
            captionContainer.selectAll('div')
              .data(captions)
              .enter()
              .append('div')
              .style('font-size',function(d,i){return options.caption_sizes[i]+'pt'})
              .text(function(d){return options[d]});

            envs.captionContainer = captionContainer;

            return container;
          }
        });
        leafletObj.addControl(new captionWindow());

        /*
        // 保存ボタンを作成
        if(!isEdge && !isIE && options.save_button){
          $('<button>').text('画像として保存')
            .on('click',　function (){
              var width = options.ref_size.width * 2;
              var height = options.ref_size.height * 2;
              var proxy_canvas = $("<canvas>");
              proxy_canvas.attr('style','display:hidden;')
                .attr('width', width)
                .attr('height', height);
              var ctx = proxy_canvas[0].getContext('2d');
              var svg_data = new XMLSerializer().serializeToString(map_container[0][0]);
              var img = "data:image/svg+xml;charset=utf-8;base64," + btoa(unescape(encodeURIComponent(svg_data)));
              var image = new Image();
              image.onload = function(){
                ctx.fillStyle = '#fff';
                ctx.fillRect(0,0,width,height);
                ctx.drawImage(image, 0, 0);
                var downloader = $("<a>").attr('style','display:hidden')
                  .attr('type','application/octet-stream')
                  .attr('href', proxy_canvas[0].toDataURL("image/png"))
                  .text('download')
                  .attr('download',options.save_filename+'.png')
                  .appendTo('body');
                downloader[0].click();
                proxy_canvas.remove();
                downloader.remove();
              }
              image.src = img;
            })
            .attr('class','btn btn-default')
            .appendTo(selector);
        }
        */

        // 全処理が終了したらcallback呼び出し (即updateしたい場合に用いる)
        if(typeof callback == 'function') callback();

      }
      return(this);
    },
    update : function( input_options ) {
      var options = $(this.selector)[0].japaneseMapOpts;
      var envs = $(this.selector)[0].japaneseMapEnvs;
      options = $.extend(options, input_options);

      envs.geoJsonLayer.getLayers().forEach(function(x){
        envs.geoJsonLayer.resetStyle(x);
        options.eachfeature(envs.geoJsonLayer, x.feature, x);
      });

      var caption_elems = envs.captionContainer.selectAll('div')
        .text(function(d){return options[d]});

      //  凡例更新
      if(options.show_legend && options.color_scale){
        update_legend(envs.legendContainer, options);
      }
    },
    modify_geojson_layer :function(criteria, style){
      var envs = $(this.selector)[0].japaneseMapEnvs;
      var geoJsonLayer = envs.geoJsonLayer;
      var openedTooltip = false;
      geoJsonLayer.getLayers().forEach(function(l){
        if(l.__modifiedStyle){
          geoJsonLayer.resetStyle(l);
          l.closeTooltip();
          l.__modifiedStyle = false;
        }
        if(criteria(l.feature)){
          l.__modifiedStyle = true;
          l.setStyle(style);
          if(!openedTooltip){
            l.openTooltip();
            openedTooltip = true;
          }
        }
      });
    },
    get_commune_def : function(){
        return {communes:$(this.selector)[0].japaneseMapCommunes, id_map:$(this.selector)[0].japaneseMapIdMap};
    }
  };

  $.fn.japaneseMap = function( method ) {
    if ( methods[method] ) {
      return methods[ method ].apply( this, Array.prototype.slice.call( arguments, 1 ));
    } else if ( typeof method === 'object' || ! method ) {
      return methods.init.apply( this, arguments );
    } else {
      $.error( 'Method ' +  method + ' does not exist on jQuery.japaneseMap' );
    }
  }

})($);
