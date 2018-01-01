// VNode(Virtual Node)を生成する
// VNodeは純粋なObject
// @example
// 子VNodeが無い例
// h("div", {id: "app"})
// を実行すると以下のVNodeを生成
// {
//   tag: "div",
//   props: {
//     id: "app"
//   },
//   children: []
// }
// 子VNodeがある例
// h("div", {id: "main"}, [h("h1", {}, "Hi")])
// を実行すると以下のVNodeを生成
// {
//   tag: "div",
//   props: {
//     id: "app"
//   },
//   children: [{
//     tag: "h1",
//     props: {},
//     children: ["Hi"]  
//   }]
// }
export function h(name, props) {
  var node
  var children = []

  // 子VnodeとなるVNodeまたはVNode[]をstackに格納
  // h関数の引数3番目以降は子VNodeをVNode，VNode[]の形式で可変長で自由に渡せる
  // h("div", {id: "main"}, [VNode1],[VNode2])
  // h("div", {id: "main"}, [VNode1], VNode2)
  // はいずれも以下の記述と同じVNodeを生成
  // h("div", {id: "main"}, [VNode1,VNode2])
  for (var stack = [], i = arguments.length; i-- > 2; ) {
    stack.push(arguments[i])
  }

  while (stack.length) {
    // stackからpopしたものがNode[]だった場合は，Node[]の後ろの要素から順に取り出してStackにPush
    if (Array.isArray((node = stack.pop()))) {
      for (var i = node.length; i--; ) {
        stack.push(node[i])
      }
    } else if (node == null || node === true || node === false) {
    } else {
      // 単純にNodeをchildren配列にPush
      children.push(node)
    }
  }

  // h("div"...)のようにnameがelement名の時はObjectを生成
  // TODO: nameが関数の場合を調べる．Custome elementかな．
  return typeof name === "string"
    ? {
        name: name,
        props: props || {},
        children: children
      }
    : name(props || {}, children)
}

// state, actions, view をcontainerにマウントする
// @return actions
// @param {Object} state 状態を保持する純粋なObject
// @param {Object} actions stateを変更する関数を含むObject
// @param {Object} view stateとactionを引数にVNodeを返す関数
// @param {Object} contaienr: ViewをInsertする対象のDOM
// @example
// const state = { count: 0 }
// const actions = { up: value => state => ({ count: state.count + value }) }
// const view = h("h1", {}, state.count)
// app(state, actions, view, document.body)
export function app(state, actions, view, container) {
  var patchLock
  var lifecycle = []
  var root = container && container.children[0] //コンテナ内の子要素
  var node = vnode(root, [].map) // root elementのVNodeを生成

  // repaint自体は引数はないが，内部でローカル変数を参照するため，()内に参照するものを記述？
  repaint(init([], (state = copy(state)), (actions = copy(actions))))

  return actions

  // root elementのVNodeを生成
  function vnode(element, map) {
    return (
      element && {
        name: element.nodeName.toLowerCase(),
        props: {},
        children: map.call(element.childNodes, function(element) {
          return element.nodeType === 3
            ? element.nodeValue
            : vnode(element, map)
        })// element.childNodes.map(function(element){略}) と同等
      }
    )
  }

  // Vnodeを生成し，path関数でDOMを生成
  // 引数nextが渡されておらず，内部で初期化されてるので良くわからない
  // nextは単純に変数として使われてる
  function render(next) {
    // ロックをfalseにする
    patchLock = !patchLock
    // view関数にstateとactionsを渡してVNodeを生成しnextに格納
    next = view(state, actions)

    if (container && !patchLock) {
      // root(DOM)を更新
      // container: Insert対象のDOM
      // root: 現在のDOM
      // node(oldNode): 更新前のVNode
      // node: 更新後のVNode．appのローカル変数nodeも更新
      //     patch(parent, element, oldNode, node, isSVG, nextSibling)
      root = patch(container, root, node, (node = next))
      // ↑のコードは以下のコードと同等
      // oldNode = node
      // node = next
      // root = patch(container, root, oldNode, node)
    }
    // lifecycleからnextを取り出して，順に実行
    // render初回実行時は lifecycleは空配列なので何もしない
    while ((next = lifecycle.pop())) next()
  }
  // patchLockでロックをかけてから非同期でrenderを呼び出す
  function repaint() {
    if (!patchLock) {
      patchLock = !patchLock
      setTimeout(render)
    }
  }

  // 引数で渡したObject a,bのメンバを持つオブジェクトを生成する
  // 同じメンバを持つときはbの値を優先
  function copy(a, b) {
    var target = {}

    for (var i in a) target[i] = a[i]
    for (var i in b) target[i] = b[i]

    return target
  }

  // targetの特定パスの値を特定の値に設定する
  // また，sourceの持つメンバをtargetにコピーする
  // targetとsourceで同一のメンバを持つときはtarget優先
  function set(path, value, source, target) {
    if (path.length) { // [1,2,3].slice(1) => [2,3]
      target[path[0]] =
        1 < path.length ? set(path.slice(1), value, source[path[0]], {}) : value // 再帰処理
      return copy(source, target)
    }
    return value
  }

  // ネストされたObjectから指定されたパスのObjectを取得
  // @param {string[]} path
  // @param {Object} source
  // @example
  // path = ["hoge","fuga"]
  // source = {"hoge": {"fuga": "nyaan"}}
  // get(path, source) // => "nyaan"
  function get(path, source) {
    for (var i = 0; i < path.length; i++) {
      source = source[path[i]]
    }
    return source
  }
  // @example
  // path = []
  // slice = {count: 0}
  // actions = {
  //   down: value => state => ({count: state.count - value}),
  //   up: value => state => ({count: state.count + value})
  // }
  // init([], slice, actions)
  function init(path, slice, actions) {
    for (var key in actions) {
      // actionが関数の時
      typeof actions[key] === "function"
        ? (function(key, action) {
            // actions[key]をいい感じに再定義してる
            actions[key] = function(data) {
              // stateから指定pathのObjectを取得
              slice = get(path, state)

              // オリジナルのaction関数にdataを渡して結果をdataに格納
              // dataが関数だったら，slice(stateの一部)とactionsを引数に実行
              // オリジナルのaction関数は，valueを受け取って state => {} 関数を返す
              if (typeof (data = action(data)) === "function") {
                data = data(slice, actions)
              }
              
              // dataがNot Null && dataがsliceと異なる && Promiseオブジェクトじゃない時，DOMを再描画
              if (data && data !== slice && !data.then) {
                repaint((state = set(path, copy(slice, data), state, {})))
              }

              return data
            }
          })(key, actions[key])
        : init(
            // actionsがネストされている場合はkeyをpathに追加して，initを再実行
            // @example
            // actions = {
            //   game_actions: {
            //     start: value => state => ({...}),
            //     stop: value => state => ({...}),
            //   }
            // }
            // actions["game_actions"]は[Object]
            // pathは [].concat("game_actions")で ["game_actions"]に
            // slice[""]
            path.concat(key),// [1,2,3].concat(4) => [1,2,3,4]
            (slice[key] = slice[key] || {}),
            (actions[key] = copy(actions[key]))
          )
    }
  }

  // node.props.keyを返す
  // なかったらnull
  function getKey(node) {
    return node && node.props ? node.props.key : null
  }

  function setElementProp(element, name, value, oldValue) {
    if (name === "key") {
    } else if (name === "style") {
      for (var i in copy(oldValue, value)) {
        element[name][i] = value == null || value[i] == null ? "" : value[i]
      }
    } else {
      try {
        element[name] = value == null ? "" : value
      } catch (_) {}

      if (typeof value !== "function") {
        if (value == null || value === false) {
          element.removeAttribute(name)
        } else {
          element.setAttribute(name, value)
        }
      }
    }
  }

  function createElement(node, isSVG) {
    // nodeがObjectでなく文字列か数字のとき，TextNodeを生成
    // svgの要素を作るときは，createElementNSを使用 ref: https://developer.mozilla.org/ja/docs/Web/API/Document/createElementNS
    // それ以外のときはcreateElementで要素生成
    var element =
      typeof node === "string" || typeof node === "number"
        ? document.createTextNode(node)
        : (isSVG = isSVG || node.name === "svg")
          ? document.createElementNS("http://www.w3.org/2000/svg", node.name)
          : document.createElement(node.name)

    if (node.props) {
      if (node.props.oncreate) {
        lifecycle.push(function() {
          node.props.oncreate(element)
        })
      }

      for (var i = 0; i < node.children.length; i++) {
        element.appendChild(createElement(node.children[i], isSVG))
      }

      for (var name in node.props) {
        setElementProp(element, name, node.props[name])
      }
    }

    return element
  }

  // 要素のpropsを更新する
  // @param element 更新する要素
  // @param oldProps 以前のprops
  // @param props 新しいprops
  function updateElement(element, oldProps, props) {
    // copy: oldpropsをpropsにコピー(propsになくoldPropsにだけあるpropをpropsに追加)
    for (var name in copy(oldProps, props)) {
      // oldpropsとpropsの各propの値を比較し，異なる場合はsetElementPropで要素のpropを更新
      // value, chekedの場合は値をDOMから取得
      if (
        props[name] !==
        (name === "value" || name === "checked"
          ? element[name]
          : oldProps[name])
      ) {
        setElementProp(element, name, props[name], oldProps[name])
      }
    }

    if (props.onupdate) {
      lifecycle.push(function() {
        props.onupdate(element, oldProps)
      })
    }
  }

  function removeChildren(element, node, props) {
    if ((props = node.props)) {
      for (var i = 0; i < node.children.length; i++) {
        removeChildren(element.childNodes[i], node.children[i])
      }

      if (props.ondestroy) {
        props.ondestroy(element)
      }
    }
    return element
  }

  function removeElement(parent, element, node, cb) {
    function done() {
      parent.removeChild(removeChildren(element, node))
    }

    if (node.props && (cb = node.props.onremove)) {
      cb(element, done)
    } else {
      done()
    }
  }

  // 新しいVnodeと古いVnodeを比べて変更箇所のDOMを再描画
  function patch(parent, element, oldNode, node, isSVG, nextSibling) {
    if (node === oldNode) {
    } else if (oldNode == null) {
      // oldNodeがなければ，現在のVnodeからDOMを構築
      element = parent.insertBefore(createElement(node, isSVG), element)
    } else if (node.name && node.name === oldNode.name) {
      updateElement(element, oldNode.props, node.props)

      var oldElements = []
      var oldKeyed = {}
      var newKeyed = {}

      for (var i = 0; i < oldNode.children.length; i++) {
        oldElements[i] = element.childNodes[i]

        var oldChild = oldNode.children[i]
        var oldKey = getKey(oldChild)

        if (null != oldKey) {
          oldKeyed[oldKey] = [oldElements[i], oldChild]
        }
      }

      var i = 0
      var j = 0

      while (j < node.children.length) {
        var oldChild = oldNode.children[i]
        var newChild = node.children[j]

        var oldKey = getKey(oldChild)
        var newKey = getKey(newChild)

        if (newKeyed[oldKey]) {
          i++
          continue
        }

        if (newKey == null) {
          if (oldKey == null) {
            patch(element, oldElements[i], oldChild, newChild, isSVG)
            j++
          }
          i++
        } else {
          var recyledNode = oldKeyed[newKey] || []

          if (oldKey === newKey) {
            patch(element, recyledNode[0], recyledNode[1], newChild, isSVG)
            i++
          } else if (recyledNode[0]) {
            patch(
              element,
              element.insertBefore(recyledNode[0], oldElements[i]),
              recyledNode[1],
              newChild,
              isSVG
            )
          } else {
            patch(element, oldElements[i], null, newChild, isSVG)
          }

          j++
          newKeyed[newKey] = newChild
        }
      }

      while (i < oldNode.children.length) {
        var oldChild = oldNode.children[i]
        if (getKey(oldChild) == null) {
          removeElement(element, oldElements[i], oldChild)
        }
        i++
      }

      for (var i in oldKeyed) {
        if (!newKeyed[oldKeyed[i][1].props.key]) {
          removeElement(element, oldKeyed[i][0], oldKeyed[i][1])
        }
      }
    } else if (node.name === oldNode.name) {
      element.nodeValue = node
    } else {
      element = parent.insertBefore(
        createElement(node, isSVG),
        (nextSibling = element)
      )
      removeElement(parent, nextSibling, oldNode)
    }
    return element
  }
}
