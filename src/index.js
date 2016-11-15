import * as t from "babel-types";

export default function () {
  function toStatements(node) {
     if (t.isBlockStatement(node)) {
      var hasBlockScoped = false;

      for (var i = 0; i < node.body.length; i++) {
        var bodyNode = node.body[i];
        if (t.isBlockScoped(bodyNode)) hasBlockScoped = true;
      }

      if (!hasBlockScoped) {
        return node.body;
      }
    }

    return node;
  }

  var visitor = {
    ReferencedIdentifier(path, state) {
      if (!state.opts.experimentalInlining) return;

      const { node, scope } = path;
      var binding = scope.getBinding(node.name);
      if (!binding || binding.references > 1 || !binding.constant) return;
      if (binding.kind === "param" || binding.kind === "module") return;

      // Do not remove exports like `export function t() { }`.
      if (t.isExportDeclaration(binding.path.parent)) return;

      var replacement = binding.path.node;
      if (t.isVariableDeclarator(replacement)) {
        if (t.isArrayPattern(replacement.id)) {
          // don't try to inline across array destructuring
          return;
        }

        replacement = replacement.init;
      }
      if (!replacement) return;

      // ensure it's a "pure" type
      if (!scope.isPure(replacement, true)) return;

      if (t.isClass(replacement) || t.isFunction(replacement)) {
        // don't change this if it's in a different scope, this can be bad
        // for performance since it may be inside a loop or deeply nested in
        // hot code
        if (binding.path.scope.parent !== scope) return;
      }

      if (path.findParent((path) => path.node === replacement)) {
        return;
      }

      t.toExpression(replacement);
      scope.removeBinding(node.name);
      binding.path.remove();
      path.replaceWith(replacement);
    },

    "ClassDeclaration|FunctionDeclaration"(path) {
      const { node, scope } = path;
      if (t.isClass(node) && node.decorators && node.decorators.length) {
        // We don't want to remove classes that have attached decorators.
        // The decorator itself is referencing the class and might have side effects, like
        // registering the class somewhere else.
        return;
      }
      // Anonymous functions will either be used immediately
      // or assigned to a variable, which will be DCE'd if it's unused.
      // Either way, we can't do anything here.
      if (!node.id) return;

      var binding = scope.getBinding(node.id.name);
      if (binding && !binding.referenced) {
        path.remove();
        // binding might never be read (have no references) yet still be written to
        // so replace all constantViolations (assignments) with the assigned value
        for (const path of binding.constantViolations) {
          path.replaceWith(path.node.right);
        }
      }
    },

    VariableDeclarator({ node, scope }) {
      if (!t.isIdentifier(node.id) || !scope.isPure(node.init, true)) return;
      visitor["ClassDeclaration|FunctionDeclaration"].apply(this, arguments);
    },

    ConditionalExpression: {
      exit(path) {
        const { node } = path;
        var evaluateTest = path.get("test").evaluateTruthy();
        if (evaluateTest === true) {
          path.replaceWith(node.consequent);
        } else if (evaluateTest === false) {
          path.replaceWith(node.alternate);
        }
      }
    },

    LogicalExpression: {
      exit(path) {
        const { node } = path;
        var operator = path.get("operator").node;
        var leftOfOperatorTest = path.get("left").evaluateTruthy();
        if (operator === "&&") {
          if (leftOfOperatorTest === true) {
            path.replaceWith(node.right);
          } else if (leftOfOperatorTest === false) {
            path.replaceWith(node.left);
          }
        } else if (operator === "||") {
          if (leftOfOperatorTest === true) {
            path.replaceWith(node.left);
          } else if (leftOfOperatorTest === false) {
            path.replaceWith(node.right);
          }
        }
      }
    },

    BlockStatement: {
      exit(path) {
        var paths = path.get("body");

        var purge = false;

        for (var i = 0; i < paths.length; i++) {
          let path = paths[i];

          if (!purge && t.isCompletionStatement(path)) {
            purge = true;
            continue;
          }

          if (purge && !t.isFunctionDeclaration(path) && !path.node._blockHoist) {
            path.remove();
          }
        }
      }
    },

    IfStatement: {
      exit(path) {
        const { node } = path;
        var consequent = node.consequent;
        var alternate  = node.alternate;
        var test = node.test;

        var evaluateTest = path.get("test").evaluateTruthy();

        // we can check if a test will be truthy 100% and if so then we can inline
        // the consequent and completely ignore the alternate
        //
        //   if (true) { foo; } -> { foo; }
        //   if ("foo") { foo; } -> { foo; }
        //

        if (evaluateTest === true) {
          path.replaceWithMultiple(toStatements(consequent));
          return;
        }

        // we can check if a test will be falsy 100% and if so we can inline the
        // alternate if there is one and completely remove the consequent
        //
        //   if ("") { bar; } else { foo; } -> { foo; }
        //   if ("") { bar; } ->
        //

        if (evaluateTest === false) {
          if (alternate) {
            path.replaceWithMultiple(toStatements(alternate));
          } else {
            path.remove();
          }
          return;
        }

        // remove alternate blocks that are empty
        //
        //   if (foo) { foo; } else {} -> if (foo) { foo; }
        //

        if (t.isBlockStatement(alternate) && !alternate.body.length) {
          alternate = node.alternate = null;
        }

        // if the consequent block is empty turn alternate blocks into a consequent
        // and flip the test
        //
        //   if (foo) {} else { bar; } -> if (!foo) { bar; }
        //

        if (t.isBlockStatement(consequent) && !consequent.body.length && t.isBlockStatement(alternate) && alternate.body.length) {
          node.consequent = node.alternate;
          node.alternate  = null;
          node.test       = t.unaryExpression("!", test, true);
        }
      }
    }
  };

  return { visitor };
}
